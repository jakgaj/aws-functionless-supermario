import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';

export class SuperPostSharedStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const regions = this.node.tryGetContext('regions');

    // S3 bucket
    const bucket = new s3.Bucket(this, 'Bucket', {
      bucketName: `aws-functionless-supermario-${this.account}-${this.region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // File upload to bucket
    const jsonFile = new s3deploy.DeployTimeSubstitutedFile(this, 'JsonFile', {
      source: 'src/bucket-content/superpost-documents.json',
      destinationBucket: bucket,
      substitutions: {}
    });

    // SSM parameters
    new ssm.StringParameter(this, 'SsmParam1', {
      parameterName: '/superPost/config/bucketName',
      stringValue: bucket.bucketName
    });

    new ssm.StringParameter(this, 'SsmParam2', {
      parameterName: '/superPost/config/documentsFile',
      stringValue: jsonFile.objectKey
    });

    // DynamoDB global table
    new dynamodb.TableV2(this, 'SuperMailboxTable', {
      tableName: 'SuperMailbox',
      partitionKey: { 
        name: 'letterId',
        type: dynamodb.AttributeType.STRING
      },
      billing: dynamodb.Billing.onDemand(),
      tableClass: dynamodb.TableClass.STANDARD_INFREQUENT_ACCESS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      deletionProtection: false,
      pointInTimeRecovery: false,
      replicas: [
        { region: regions.secondary }
      ],
    });

    // CloudWatch Dashboard for EventBridge events
    const dashboard = new cloudwatch.Dashboard(this, 'CwDashboard', {
      dashboardName: 'SuperPost',
      periodOverride: cloudwatch.PeriodOverride.AUTO,
      start: "-PT1H"
    });

    const queryLines = {
      primary: [
        'fields detail.letterId as LetterId, detail.sender.name as From, detail.recipient.name as To, detail.message.topic as Topic, detail.status as Status, detail.documentType as Type, detail.updatedAt as UpdatedAt',
        'filter source = "SuperPost"',
        'sort @timestamp desc'
      ],
      secondary: [
        'fields detail.letterId as LetterId, detail.sender.name as From, detail.recipient.name as To, detail.topic as Topic, detail.status as Status, detail.reaction as Reaction, detail.updatedAt as UpdatedAt',
        'filter source = "SuperPost"',
        'sort @timestamp desc'
      ]
    };

    dashboard.addWidgets(
      new cloudwatch.LogQueryWidget({
        title: `SuperPost Events (${regions.primary})`,
        view: cloudwatch.LogQueryVisualizationType.TABLE,
        width: 24,
        height: 6,
        logGroupNames: [ '/aws/events/SuperPost' ],
        region: regions.primary,
        queryLines: queryLines.primary
      }),
      new cloudwatch.LogQueryWidget({
        title: `SuperPost Events (${regions.secondary})`,
        view: cloudwatch.LogQueryVisualizationType.TABLE,
        width: 24,
        height: 6,
        logGroupNames: [ '/aws/events/SuperPost' ],
        region: regions.secondary,
        queryLines: queryLines.secondary
      })
    );

  }
}