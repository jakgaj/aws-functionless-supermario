import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as secrets from 'aws-cdk-lib/aws-secretsmanager';

export class SharedResourcesStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const regions = this.node.tryGetContext('regions');

    // S3 bucket
    const bucket = new s3.Bucket(this, 'Bucket', {
      bucketName: `aws-functionless-invoices-${this.account}-${this.region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // File upload to bucket
    const jsonFile = new s3deploy.DeployTimeSubstitutedFile(this, 'JsonFile', {
      source: 'src/bucket-content/invoices-metadata.json',
      destinationBucket: bucket,
      substitutions: {}
    });

    // SSM parameter with bucket name
    new ssm.StringParameter(this, 'SsmParam1', {
      parameterName: '/invoices/config/bucketName',
      stringValue: bucket.bucketName
    });

    // SSM parameter with bucket key
    new ssm.StringParameter(this, 'SsmParam2', {
      parameterName: '/invoices/config/jsonFile',
      stringValue: jsonFile.objectKey
    });

    // DynamoDB global table
    new dynamodb.TableV2(this, 'InvoicesTable', {
      tableName: 'Invoices',
      partitionKey: { name: 'invoiceId', type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      tableClass: dynamodb.TableClass.STANDARD_INFREQUENT_ACCESS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      deletionProtection: false,
      pointInTimeRecovery: true,
      replicas: [
        { region: regions.secondary }
      ],
    });

    // Secrets Manager secret object
    const secret = new secrets.Secret(this, 'InvoiceStamp', {
      secretName: 'InvoiceStamp',
      description: 'Stamp values for EnhanceInvoices state machine',
      replicaRegions: [
        { region: regions.secondary }
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      secretObjectValue: {
        fiscalYear: cdk.SecretValue.unsafePlainText(new Date().getFullYear().toString()),
        countryCode: cdk.SecretValue.unsafePlainText('DE'),
        currencyCode: cdk.SecretValue.unsafePlainText('EUR')
      }  
    })

  }
}