import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as states from 'aws-cdk-lib/aws-stepfunctions';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secrets from 'aws-cdk-lib/aws-secretsmanager';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';

export class SuperPostSecondaryStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // EventBridge event bus
    const bus = new events.EventBus(this, 'SuperPostBus2', {
      eventBusName: 'SuperPost'
    });

    // SSM parameters
    new StringParameter(this, 'SsmParam1', {
      parameterName: '/superPost/scoreboard/hearts',
      stringValue: '0'
    });

    // Secrets Manager secret object
    const secret = new secrets.Secret(this, 'ReactionsBank', {
      secretName: 'ReactionsBank',
      description: 'Encoded reactions for CollectLetters state machine',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      secretObjectValue: {
        heartPurple: cdk.SecretValue.unsafePlainText(Buffer.from('💜').toString('base64')),
        heartBlue: cdk.SecretValue.unsafePlainText(Buffer.from('💙').toString('base64')),
        heartYellow: cdk.SecretValue.unsafePlainText(Buffer.from('💛').toString('base64')),
      }  
    });

    // Step Functions state machine
    const machine = new states.StateMachine(this, 'CollectLettersStateMachine', {
      stateMachineName: 'CollectLetters',
      definitionBody: states.DefinitionBody.fromFile('src/state-machines/collect-letters-sm.yaml'),
      timeout: cdk.Duration.minutes(5),
      tracingEnabled: true,
      logs: {
        destination: new logs.LogGroup(this, 'CollectLettersMachineLogs', {
          logGroupName: '/aws/states/CollectLetters',
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
          "ssm:PutParameter*",
          "events:PutEvents",
          "secretsmanager:GetSecretValue",
        ],
        resources: [
          `arn:aws:dynamodb:*:${this.account}:table/SuperMailbox`,
          `arn:aws:ssm:*:${this.account}:parameter/superPost/*`,
          `arn:aws:events:*:${this.account}:event-bus/SuperPost`,
          `arn:aws:secretsmanager:*:${this.account}:secret:ReactionsBank*`
        ],
      })
    );

    // CloudWatch log group for EventBridge events
    const logGroup = new logs.LogGroup(this, 'SuperPostEventsLogGroup', {
      logGroupName: '/aws/events/SuperPost',
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // EventBridge event rule to trigger state machine
    new events.Rule(this, 'CollectLettersRule', {
      ruleName: 'ReceiveLetters',
      description: 'Start execution of state machine CollectLetters',
      eventBus: bus,
      eventPattern: {
        source: [ "SuperPost" ],
        detailType: [ "NewLetters" ]
      },
      enabled: true,
      targets: [
        new targets.SfnStateMachine(machine, {
          input: events.RuleTargetInput.fromEventPath('$.detail')
        })
      ]
    });

    // EventBridge event rule to send local events to CloudWatch Logs
    new events.Rule(this, 'LetterCollectedRule', {
      ruleName: 'LetterCollected',
      description: 'Log events related to collected letters',
      eventBus: bus,
      eventPattern: {
        source: [ "SuperPost" ],
        detailType: [ "LetterCollected" ]
      },
      enabled: true,
      targets: [
        new targets.CloudWatchLogGroup(logGroup)
      ]
    });

  }
}
