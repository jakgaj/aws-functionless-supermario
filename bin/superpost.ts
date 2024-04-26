#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SuperPostSharedStack } from '../lib/superpost-shared-stack';
import { SuperPostPrimaryStack } from '../lib/superpost-primary-stack';
import { SuperPostSecondaryStack } from '../lib/superpost-secondary-stack';

const app = new cdk.App();
const regions = app.node.tryGetContext('regions');

const sharedStack = new SuperPostSharedStack(app, 'SuperPostSharedStack', {
  env: { region: regions.primary }
});

const primaryStack = new SuperPostPrimaryStack(app, 'SuperPostPrimaryStack', {
  env: { region: regions.primary }
});

const secondaryStack = new SuperPostSecondaryStack(app, 'SuperPostSecondaryStack', {
  env: { region: regions.secondary }
});

secondaryStack.addDependency(sharedStack);
primaryStack.addDependency(sharedStack);
primaryStack.addDependency(secondaryStack);
