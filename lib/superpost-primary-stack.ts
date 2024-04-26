import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as states from 'aws-cdk-lib/aws-stepfunctions';
import * as logs from 'aws-cdk-lib/aws-logs';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';

export class SuperPostPrimaryStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const regions = this.node.tryGetContext('regions');

    // EventBridge event bus
    const bus = new events.EventBus(this, 'SuperPostBus1', {
      eventBusName: 'SuperPost'
    });

    // Step Functions state machine
    const machine = new states.StateMachine(this, 'DispatchLettersStateMachine', {
      stateMachineName: 'DispatchLetters',
      definitionBody: states.DefinitionBody.fromFile('src/state-machines/dispatch-letters-sm.yaml'),
      timeout: cdk.Duration.minutes(5),
      tracingEnabled: true,
      logs: {
        destination: new logs.LogGroup(this, 'DispatchLettersStateMachineLogs', {
          logGroupName: '/aws/states/DispatchLetters',
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
          `arn:aws:dynamodb:*:${this.account}:table/SuperMailbox`,
          `arn:aws:ssm:*:${this.account}:parameter/superPost/*`,
          `arn:aws:events:*:${this.account}:event-bus/SuperPost`,
          `arn:aws:s3:::aws-functionless-supermario-${this.account}-${this.region}/*`,
          `arn:aws:states:*:${this.account}:stateMachine:DispatchLetters`,
          `arn:aws:states:*:${this.account}:execution:DispatchLetters:*`,
        ],
      })
    );

    // EventBridge event rule to trigger state machine
    new events.Rule(this, 'ImportLettersRule', {
      ruleName: 'ImportLetters',
      description: 'Start execution of state machine DispatchLetters',
      eventBus: bus,
      eventPattern: {
        source: [ "SuperPost" ],
        detailType: [ "ImportLetters" ]
      },
      enabled: true,
      targets: [
        new targets.SfnStateMachine(machine, {
          input: events.RuleTargetInput.fromObject({})
        })
      ]
    });

    // EventBridge event rule to send events to secondary event bus
    new events.Rule(this, 'SendLettersRule', {
      ruleName: 'SendLetters',
      description: 'Send events to event bus in secondary region',
      eventBus: bus,
      eventPattern: {
        source: [ "SuperPost" ],
        detailType: [ "NewLetters" ]
      },
      enabled: true,
      targets: [
        new targets.EventBus(
          events.EventBus.fromEventBusArn(this, 'SuperPostBus2', 
            `arn:aws:events:${regions.secondary}:${this.account}:event-bus/SuperPost`
          )
        )
      ]
    });

  }
}
