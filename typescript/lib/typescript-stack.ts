import * as cdk from "@aws-cdk/core";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as ecs from "@aws-cdk/aws-ecs";
import * as ecr from "@aws-cdk/aws-ecr";
import * as ecs_patterns from "@aws-cdk/aws-ecs-patterns";
import { ApplicationProtocol } from "@aws-cdk/aws-elasticloadbalancingv2";
import * as acm from "@aws-cdk/aws-certificatemanager";
import { HostedZone } from "@aws-cdk/aws-route53";
import * as iam from "@aws-cdk/aws-iam";
import { LogGroup, RetentionDays } from "@aws-cdk/aws-logs";
import { CfnService } from "@aws-cdk/aws-ecs";

export class TypescriptStack extends cdk.Stack {
  private appName: string;
  private repositoryName: string;
  private vpcName: string;
  private clusterName: string;
  private loggingStreamPrefix: string;
  private executionRoleName: string;
  private albName: string;
  private containerName: string;
  private taskDefinitionName: string;
  private serviceName: string;
  private certName: string;
  private certARN: string;
  private domainName: string;
  private zoneName: string;
  private hostedZoneId: string;
  private loadBalancerOPName: string;
  private healthCheckPath: string;
  private roleDesc: string;
  private roleActions: string[];
  private logGroupName: string;

  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.appName = "websimio";

    // 👇 Uses above default app name to create other resource names
    this.repositoryName = `${this.appName}-repository`;
    this.vpcName = `${this.appName}-vpc`;
    this.clusterName = `${this.appName}-cluster`;
    this.loggingStreamPrefix = `${this.appName}`;
    this.executionRoleName = `${this.appName}-execution-role`;
    this.albName = `${this.appName}-alb`;
    this.containerName = `${this.appName}-container`;
    this.taskDefinitionName = `${this.appName}-task-definition`;
    this.serviceName = `${this.appName}-api-service`;
    this.certName = `${this.appName}-cert`;
    this.certARN =
      "arn:aws:acm:us-east-1:713707877658:certificate/72363c9f-eb07-47db-b25f-e472bd76ae5e";
    this.domainName = "websim.io";
    this.zoneName = `${this.appName}-zone`;
    this.hostedZoneId = "Z04535052UVVBAQYA78G";
    this.loadBalancerOPName = "websimio-loadBalancerDNS";
    this.healthCheckPath = "/healthcheck";
    this.roleActions = [
      "ecr:GetAuthorizationToken",
      "ecr:BatchCheckLayerAvailability",
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ];
    this.roleDesc = "Execution Role for WebSIMIO";
    this.logGroupName = `${this.appName}-log-group`;
    //

    // 👇 Create the ECR Repository
    const repository = new ecr.Repository(this, this.repositoryName, {
      repositoryName: this.repositoryName,
    });

    // 👇 Create VPC
    const vpc = new ec2.Vpc(this, this.vpcName, { maxAzs: 2 });
    const cluster = new ecs.Cluster(this, this.clusterName, {
      clusterName: this.clusterName,
      vpc,
    });

    // 👇 Create a task definition with CloudWatch Logs
    const logGroup = new LogGroup(this, this.logGroupName, {
      retention: RetentionDays.ONE_WEEK,
      logGroupName: this.logGroupName,
    });

    const logging = new ecs.AwsLogDriver({
      logGroup,
      streamPrefix: this.loggingStreamPrefix,
    });

    // 👇 Create a Policy Document (Collection of Policy Statements)
    const allowExecutionForEvents = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          resources: ["*"],
          actions: this.roleActions,
          // 👇 Default for `effect` is ALLOW
          effect: iam.Effect.ALLOW,
        }),
      ],
    });

    // 👇 Create role, to which we'll attach our Policies
    const role = new iam.Role(this, this.executionRoleName, {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      description: this.roleDesc,
      inlinePolicies: {
        // 👇 attach the Policy Document as inline policies
        AllowedEvents: allowExecutionForEvents,
      },
      roleName: this.executionRoleName,
    });

    // 👇 Create Load Balancer with Fargate
    const albService = new ecs_patterns.ApplicationLoadBalancedFargateService(
      this,
      this.albName,
      {
        loadBalancerName: this.albName,
        memoryLimitMiB: 512,
        taskImageOptions: {
          image: ecs.ContainerImage.fromRegistry("amazon/amazon-ecs-sample"),
          containerName: this.containerName,
          containerPort: 80,
          logDriver: logging,
          family: this.taskDefinitionName,
          executionRole: role,
          enableLogging: true,
        },
        serviceName: this.serviceName,
        cluster,
        certificate: acm.Certificate.fromCertificateArn(
          this,
          this.certName,
          this.certARN
        ),
        domainName: this.domainName,
        domainZone: HostedZone.fromHostedZoneAttributes(this, this.zoneName, {
          hostedZoneId: this.hostedZoneId,
          zoneName: this.domainName,
        }),
        listenerPort: 443,
        protocol: ApplicationProtocol.HTTPS,
        targetProtocol: ApplicationProtocol.HTTP,
        desiredCount: 1,
      }
    );

    // Configure health check endpoint
    albService.targetGroup.configureHealthCheck({
      path: this.healthCheckPath,
    });

    albService.taskDefinition.addContainer("logger-sidecar", {
      image: ecs.ContainerImage.fromRegistry("busybox"),
      command: ["tail", "-n+1", "-F", "/apps/api/logs/combined.outerr.log"],
      logging: new ecs.AwsLogDriver({
        streamPrefix: `${this.appName}-app-logs`,
        logGroup,
      }),
      containerName: "logger-sidecar",
    });

    // const cfnService = albService.service.node.tryFindChild(
    //   "Service"
    // ) as CfnService;

    // cfnService.addPropertyOverride("mountPoints","")

    // (
    //   albService.service.node.tryFindChild("Service") as CfnService
    // )?.addPropertyOverride("TaskDefinition", "");

    new cdk.CfnOutput(this, this.loadBalancerOPName, {
      value: albService.loadBalancer.loadBalancerDnsName,
    });
  }
}
