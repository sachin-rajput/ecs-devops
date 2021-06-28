import * as cdk from "@aws-cdk/core";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as ecs from "@aws-cdk/aws-ecs";
import * as ecr from "@aws-cdk/aws-ecr";
import * as elbv2 from "@aws-cdk/aws-elasticloadbalancingv2";
import * as ecs_patterns from "@aws-cdk/aws-ecs-patterns";
import { ApplicationProtocol } from "@aws-cdk/aws-elasticloadbalancingv2";
import * as acm from "@aws-cdk/aws-certificatemanager";
import { Certificate } from "@aws-cdk/aws-certificatemanager";
import { HostedZone } from "@aws-cdk/aws-route53";

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
    });

    // Create task definition
    // const taskDefinition = new ecs.FargateTaskDefinition(
    //   this,
    //   "websimio-taskdefinition",
    //   { family: "websimio-taskdefinition" }
    // );
    // Ec2TaskDefinition(
    //   this,
    //   "websimio-taskdefinition"
    // );

    // const container = taskDefinition.addContainer("websimio-container", {
    //   image: ecs.ContainerImage.fromRegistry("amazon/amazon-ecs-sample"),
    //   memoryLimitMiB: 512,
    //   logging,
    //   containerName: "websimio-container",
    // });

    // container.addPortMappings({
    //   containerPort: 80,
    //   hostPort: 80,
    //   protocol: ecs.Protocol.TCP,
    // });

    // // Create Service
    // const service = new ecs.FargateService(this, "websimio-api-service", {
    //   cluster,
    //   taskDefinition,
    //   serviceName: "websimio-api-service",
    // });

    // create a task definition with CloudWatch Logs
    const logging = new ecs.AwsLogDriver({ streamPrefix: "websimio" });

    // Create ALB
    const albService = new ecs_patterns.ApplicationLoadBalancedFargateService(
      this,
      "websimio-alb",
      {
        loadBalancerName: "websimio-alb",
        memoryLimitMiB: 512,
        // taskDefinition,
        taskImageOptions: {
          image: ecs.ContainerImage.fromRegistry("amazon/amazon-ecs-sample"),
          containerName: "websimio-container",
          containerPort: 80,
          logDriver: logging,
        },
        serviceName: "websimio-api-service",
        cluster,
        certificate: acm.Certificate.fromCertificateArn(
          this,
          "websimio-cert",
          "arn:aws:acm:us-east-1:713707877658:certificate/72363c9f-eb07-47db-b25f-e472bd76ae5e"
        ),
        domainName: "websim.io",
        domainZone: HostedZone.fromHostedZoneAttributes(this, "websimio-zone", {
          hostedZoneId: "Z04535052UVVBAQYA78G",
          zoneName: "websim.io",
        }),
        listenerPort: 443,
        protocol: ApplicationProtocol.HTTPS,
        targetProtocol: ApplicationProtocol.HTTP,
        desiredCount: 1,
      }
    );
    albService.targetGroup.configureHealthCheck({
      path: "/",
    });

    // // Setup AutoScaling policy
    // const scaling = albService.service.autoScaleTaskCount({ maxCapacity: 2 });
    // scaling.scaleOnCpuUtilization("websimio-asg", {
    //   policyName: "websimio-asg-policy",
    //   targetUtilizationPercent: 50,
    //   scaleInCooldown: cdk.Duration.seconds(60),
    //   scaleOutCooldown: cdk.Duration.seconds(60),
    // });

    // Add Listener
    // const listener = albService.loadBalancer.addListener(
    //   "websimio-publicListener",
    //   {
    //     port: 443,
    //     open: true,
    //     certificateArns: [
    //       "arn:aws:acm:us-east-1:713707877658:certificate/72363c9f-eb07-47db-b25f-e472bd76ae5e",
    //     ],
    //   }
    // );

    // lb.targetGroup.

    // const listener = lb.addListener("PublicListener", {
    //   port: 443,
    //   open: true,
    //   certificateArns: [
    //     "arn:aws:acm:us-east-1:713707877658:certificate/72363c9f-eb07-47db-b25f-e472bd76ae5e",
    //   ],
    // });
    // const listener = lb.addListener('PublicListener', { port: 80, open: true });

    // albService.loadBalancer.addRedirect({
    //   sourceProtocol: ApplicationProtocol.HTTP,
    //   sourcePort: 80,
    //   targetProtocol: ApplicationProtocol.HTTPS,
    //   targetPort: 443,
    // });

    // Attach ALB to ECS Service
    // listener.addTargets("ECS", {
    //   targetGroupName: "websimio-tg",
    //   port: 80,
    //   targets: [
    //     albService.service.loadBalancerTarget({
    //       containerName: "websimio-container",
    //       containerPort: 80,
    //     }),
    //   ],
    //   // include health check (default is none)
    //   healthCheck: {
    //     interval: cdk.Duration.seconds(60),
    //     path: "/",
    //     timeout: cdk.Duration.seconds(5),
    //   },
    // });

    new cdk.CfnOutput(this, "websimio-loadBalancerDNS", {
      value: albService.loadBalancer.loadBalancerDnsName,
    });
  }
}
