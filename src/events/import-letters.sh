#!/bin/bash
# Send an event to the EventBridge bus to trigger Step Functions state machine execution

primary_region=$(jq -r '.regions.primary' ../../cdk.context.json)
aws events put-events --entries file://import-letters-cli.json --region $primary_region
