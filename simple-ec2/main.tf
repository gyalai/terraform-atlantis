terraform {
  backend "s3" {
    bucket = "gyalai-terraform-states"
    key = "terraform/atlantis"
    region = "eu-central-1"

    workspace_key_prefix = "terraform-ws"
  }
}


provider "aws" {
  region     = "eu-central-1"
}

# Test AMI
resource "aws_instance" "simple_ec2" {
    instance_type = "t2.micro"
    ami = "ami-0c0933ae5caf0f5f9"  
}