import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as states from 'aws-cdk-lib/aws-stepfunctions';
import * as logs from 'aws-cdk-lib/aws-logs';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';

export class ImportInvoicesStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const regions = this.node.tryGetContext('regions');

    // EventBridge event bus
    const bus = new events.EventBus(this, 'InvoicesBus1', {
      eventBusName: 'Invoices'
    });

    // Step Functions state machine
    const machine = new states.StateMachine(this, 'ImportStateMachine', {
      stateMachineName: 'ImportInvoices',
      definitionBody: states.DefinitionBody.fromFile('src/state-machines/import-invoices-sm.yaml'),
      timeout: cdk.Duration.minutes(5),
      tracingEnabled: true,
      logs: {
        destination: new logs.LogGroup(this, 'ImportStateMachineLogs', {
          logGroupName: '/aws/states/ImportInvoices',
          removalPolicy: cdk.RemovalPolicy.DESTROY
        }),
        level: states.LogLevel.ALL,
      }
    });

    // IAM permissions for state machine role
    machine.addToRolePolicy(
      new PolicyStatement({
        actions: [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:UpdateItem",
          "ssm:GetParameter*",
          "events:PutEvents",
          "s3:GetObject",
          "states:StartExecution",
          "states:StopExecution",
          "states:DescribeExecution",
        ],
        resources: [
          `arn:aws:dynamodb:*:${this.account}:table/Invoices`,
          `arn:aws:ssm:*:${this.account}:parameter/invoices/config/*`,
          `arn:aws:events:*:${this.account}:event-bus/Invoices`,
          `arn:aws:s3:::aws-functionless-invoices-${this.account}-${this.region}/*`,
          `arn:aws:states:*:${this.account}:stateMachine:ImportInvoices`,
          `arn:aws:states:*:${this.account}:execution:ImportInvoices:*`,
        ],
      })
    );

    // EventBridge event rule to trigger state machine
    new events.Rule(this, 'ImportInvoicesRule', {
      ruleName: 'StartImport',
      description: 'Start execution of state machine ImportInvoices',
      eventBus: bus,
      eventPattern: {
        source: [ "ImportInvoices" ],
        detailType: [ "StartImport" ]
      },
      enabled: true,
      targets: [
        new targets.SfnStateMachine(machine, {
          input: events.RuleTargetInput.fromObject({})
        })
      ]
    });

    // EventBridge event rule to send events to secondary event bus
    new events.Rule(this, 'NewInvoiceRule', {
      ruleName: 'NewInvoiceImported',
      description: 'Send events to event bus in secondary region',
      eventBus: bus,
      eventPattern: {
        source: [ "ImportInvoices" ],
        detailType: [ "NewInvoiceImported" ]
      },
      enabled: true,
      targets: [
        new targets.EventBus(
          events.EventBus.fromEventBusArn(this, 'InvoicesBus2', 
            `arn:aws:events:${regions.secondary}:${this.account}:event-bus/Invoices`
          )
        )
      ]
    });

  }
}
