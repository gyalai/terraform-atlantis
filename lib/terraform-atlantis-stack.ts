import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

import * as ecs from "aws-cdk-lib/aws-ecs"
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2'
import * as sm from 'aws-cdk-lib/aws-secretsmanager'
import { CfnOutput } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as s3 from 'aws-cdk-lib/aws-s3';

export interface AtlantisStackProps {
  
  readonly vpcId: string;

  readonly ghUser: string;

  readonly ghTokenArn: string;

  readonly ghWhTokenArn: string;

  readonly repoAllowList: string;

}

export class TerraformAtlantisStack extends cdk.Stack {
  constructor(scope: Construct, id: string, atlantisStackProps: AtlantisStackProps, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = ec2.Vpc.fromLookup(this, 'VPC', {
      vpcId: atlantisStackProps.vpcId
    });

    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc: vpc
    });

    const atlantisTaskDefinition = new ecs.TaskDefinition(this, 'AtlantisTaskDefinition', {
        compatibility: ecs.Compatibility.FARGATE,
        cpu: '512',
        memoryMiB: '1024'
    });

    const secretGitHubToken = sm.Secret.fromSecretCompleteArn(this, 'atlantisGitHubToken', atlantisStackProps.ghTokenArn);
    const secretGitHubWebHookToken = sm.Secret.fromSecretCompleteArn(this, 'atlantisGitHubWHToken', atlantisStackProps.ghWhTokenArn);

    const lb = new elbv2.ApplicationLoadBalancer(this, 'LB', {
      vpc: vpc,
      internetFacing: true
    });

    const serverContainer = atlantisTaskDefinition.addContainer('Atlantis', {
      image: ecs.ContainerImage.fromRegistry('ghcr.io/runatlantis/atlantis'),
      memoryLimitMiB: 1024,
      containerName: 'atlantis-server',
      environment: {
        ATLANTIS_GH_USER: atlantisStackProps.ghUser,
        ATLANTIS_REPO_ALLOWLIST: atlantisStackProps.repoAllowList,
        ATLANTIS_ATLANTIS_URL: `http://${lb.loadBalancerDnsName}:4141`
      },
      secrets: {
        ATLANTIS_GH_TOKEN: ecs.Secret.fromSecretsManager(secretGitHubToken),
        ATLANTIS_GH_WEBHOOK_SECRET: ecs.Secret.fromSecretsManager(secretGitHubWebHookToken)
      },
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: '/atlantis/server', logRetention: 1 })
    });

    serverContainer.addPortMappings({
      containerPort: 4141,
      protocol: ecs.Protocol.TCP
    });

    const atlantisService = new ecs.FargateService(this, 'Service', {
      cluster: cluster,
      taskDefinition: atlantisTaskDefinition
    });

    

    const listener = lb.addListener('Listener', { port: 4141, protocol: elbv2.ApplicationProtocol.HTTP });

    atlantisService.registerLoadBalancerTargets({
      containerName: 'atlantis-server',
      containerPort: 4141,
      newTargetGroupId: 'ECS',
      listener: ecs.ListenerConfig.applicationListener(listener, {
        protocol: elbv2.ApplicationProtocol.HTTP,
        healthCheck: {
          port: '4141'
        }
      })
    });

    const atlantisUrl = new CfnOutput(this, 'AtltantisUrl', {
      value: lb.loadBalancerDnsName
    });

    const terraformS3Bucket = s3.Bucket.fromBucketName(this, 'TerraformS3Bucket', 'gyalai-terraform-states');

    terraformS3Bucket.grantReadWrite(atlantisTaskDefinition.taskRole, "terraform-ws/*");
  }
}