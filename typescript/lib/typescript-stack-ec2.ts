import * as cdk from "@aws-cdk/core";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as ecs from "@aws-cdk/aws-ecs";
import * as ecr from "@aws-cdk/aws-ecr";
import * as elbv2 from "@aws-cdk/aws-elasticloadbalancingv2";

export class TypescriptStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here

    // Create the ECR Repository
    const repository = new ecr.Repository(this, "websimio-repository", {
      repositoryName: "websimio-repository",
    });

    // Create VPC
    const vpc = new ec2.Vpc(this, "websimio-vpc", { maxAzs: 2 });
    const cluster = new ecs.Cluster(this, "websimio-cluster", {
      clusterName: "websimio-cluster",
      vpc,
      capacity: {
        autoScalingGroupName: "websimio-asg",
        instanceType: ec2.InstanceType.of(
          ec2.InstanceClass.T2,
          ec2.InstanceSize.MICRO
        ),
      },
    });

    // create a task definition with CloudWatch Logs
    const logging = new ecs.AwsLogDriver({ streamPrefix: "websimio" });

    // Create task definition
    const taskDefinition = new ecs.Ec2TaskDefinition(
      this,
      "websimio-taskdefinition"
    );
    const container = taskDefinition.addContainer("websimio-container", {
      image: ecs.ContainerImage.fromRegistry("amazon/amazon-ecs-sample"),
      memoryLimitMiB: 512,
      logging,
      containerName: "websimio-container",
    });

    container.addPortMappings({
      containerPort: 80,
      hostPort: 80,
      protocol: ecs.Protocol.TCP,
    });

    // Create Service
    const service = new ecs.Ec2Service(this, "websimio-api-service", {
      cluster,
      taskDefinition,
      serviceName: "websimio-api-service",
    });

    // Create ALB
    const lb = new elbv2.ApplicationLoadBalancer(this, "websimio-alb", {
      vpc,
      internetFacing: true,
      loadBalancerName: "websimio-alb",
    });
    const listener = lb.addListener("PublicListener", {
      port: 443,
      open: true,
      certificateArns: [
        "arn:aws:acm:us-east-1:713707877658:certificate/72363c9f-eb07-47db-b25f-e472bd76ae5e",
      ],
    });
    // const listener = lb.addListener('PublicListener', { port: 80, open: true });

    lb.addRedirect({
      sourceProtocol: elbv2.ApplicationProtocol.HTTP,
      sourcePort: 80,
      targetProtocol: elbv2.ApplicationProtocol.HTTPS,
      targetPort: 443,
    });

    // Attach ALB to ECS Service
    listener.addTargets("ECS", {
      targetGroupName: "websimio-tg",
      port: 80,
      targets: [
        service.loadBalancerTarget({
          containerName: "websimio-container",
          containerPort: 80,
        }),
      ],
      // include health check (default is none)
      healthCheck: {
        interval: cdk.Duration.seconds(60),
        path: "/health",
        timeout: cdk.Duration.seconds(5),
      },
    });

    // Instantiate Fargate Service with just cluster and image
    // new ecs_patterns.ApplicationLoadBalancedFargateService(this, "websimio-fargate", {
    //   cluster,
    //   taskImageOptions: {
    //     image: ecs.ContainerImage.fromRegistry("amazon/amazon-ecs-sample"),
    //   },
    // });

    new cdk.CfnOutput(this, "websimio-loadBalancerDNS", {
      value: lb.loadBalancerDnsName,
    });
  }
}
