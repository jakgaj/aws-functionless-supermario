#!/bin/bash
# Send an event to the EventBridge bus to trigger Step Functions state machine execution

aws events put-events --entries file://${1} --region ${2}
