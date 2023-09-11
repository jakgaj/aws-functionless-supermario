#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SharedResourcesStack } from '../lib/shared-resources-stack';
import { ImportInvoicesStack } from '../lib/import-invoices-stack';
import { VerifyInvoicesStack } from '../lib/verify-invoices-stack';

const app = new cdk.App();
const regions = app.node.tryGetContext('regions');

const sharedStack = new SharedResourcesStack(app, 'SharedResourcesStack', {
  env: { region: regions.primary }
});

const importStack = new ImportInvoicesStack(app, 'ImportInvoicesStack', {
  env: { region: regions.primary }
});

const verifyStack = new VerifyInvoicesStack(app, 'VerifyInvoicesStack', {
  env: { region: regions.secondary }
});

verifyStack.addDependency(sharedStack);
importStack.addDependency(sharedStack);
importStack.addDependency(verifyStack);
