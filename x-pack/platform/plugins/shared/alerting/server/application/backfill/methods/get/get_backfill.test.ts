/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ActionsAuthorization } from '@kbn/actions-plugin/server';
import { actionsAuthorizationMock, actionsClientMock } from '@kbn/actions-plugin/server/mocks';
import { RULE_SAVED_OBJECT_TYPE } from '../../../..';
import type { AlertingAuthorization } from '../../../../authorization';
import { alertingAuthorizationMock } from '../../../../authorization/alerting_authorization.mock';
import { backfillClientMock } from '../../../../backfill_client/backfill_client.mock';
import { ruleTypeRegistryMock } from '../../../../rule_type_registry.mock';
import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import {
  savedObjectsClientMock,
  savedObjectsRepositoryMock,
} from '@kbn/core-saved-objects-api-server-mocks';
import { uiSettingsServiceMock } from '@kbn/core-ui-settings-server-mocks';
import { encryptedSavedObjectsMock } from '@kbn/encrypted-saved-objects-plugin/server/mocks';
import { auditLoggerMock } from '@kbn/security-plugin/server/audit/mocks';
import { taskManagerMock } from '@kbn/task-manager-plugin/server/mocks';
import { RulesClient } from '../../../../rules_client';
import { adHocRunStatus } from '../../../../../common/constants';
import { ConnectorAdapterRegistry } from '../../../../connector_adapters/connector_adapter_registry';
import { AD_HOC_RUN_SAVED_OBJECT_TYPE } from '../../../../saved_objects';
import { transformAdHocRunToBackfillResult } from '../../transforms';
import type { SavedObject } from '@kbn/core-saved-objects-api-server';
import type { AdHocRunSO } from '../../../../data/ad_hoc_run/types';

const kibanaVersion = 'v8.0.0';
const taskManager = taskManagerMock.createStart();
const ruleTypeRegistry = ruleTypeRegistryMock.create();
const unsecuredSavedObjectsClient = savedObjectsClientMock.create();
const encryptedSavedObjects = encryptedSavedObjectsMock.createClient();
const authorization = alertingAuthorizationMock.create();
const actionsAuthorization = actionsAuthorizationMock.create();
const auditLogger = auditLoggerMock.create();
const internalSavedObjectsRepository = savedObjectsRepositoryMock.create();
const backfillClient = backfillClientMock.create();
const logger = loggingSystemMock.create().get();

const fakeRuleName = 'fakeRuleName';

const mockActionsClient = actionsClientMock.create();
const mockAdHocRunSO: SavedObject<AdHocRunSO> = {
  id: '1',
  type: AD_HOC_RUN_SAVED_OBJECT_TYPE,
  attributes: {
    apiKeyId: '123',
    apiKeyToUse: 'MTIzOmFiYw==',
    createdAt: '2024-01-30T00:00:00.000Z',
    duration: '12h',
    enabled: true,
    rule: {
      name: fakeRuleName,
      tags: ['foo'],
      alertTypeId: 'myType',
      actions: [],
      params: {},
      apiKeyOwner: 'user',
      apiKeyCreatedByUser: false,
      consumer: 'myApp',
      enabled: true,
      schedule: {
        interval: '12h',
      },
      createdBy: 'user',
      updatedBy: 'user',
      createdAt: '2019-02-12T21:01:22.479Z',
      updatedAt: '2019-02-12T21:01:22.479Z',
      revision: 0,
    },
    spaceId: 'default',
    start: '2023-10-19T15:07:40.011Z',
    status: adHocRunStatus.PENDING,
    schedule: [
      {
        interval: '12h',
        status: adHocRunStatus.PENDING,
        runAt: '2023-10-20T03:07:40.011Z',
      },
      {
        interval: '12h',
        status: adHocRunStatus.PENDING,
        runAt: '2023-10-20T15:07:40.011Z',
      },
    ],
  },
  references: [{ id: 'abc', name: 'rule', type: RULE_SAVED_OBJECT_TYPE }],
};

describe('getBackfill()', () => {
  let rulesClient: RulesClient;
  let isSystemAction: jest.Mock;

  beforeEach(async () => {
    jest.resetAllMocks();
    isSystemAction = jest.fn().mockReturnValue(false);
    mockActionsClient.isSystemAction.mockImplementation(isSystemAction);

    rulesClient = new RulesClient({
      taskManager,
      ruleTypeRegistry,
      unsecuredSavedObjectsClient,
      authorization: authorization as unknown as AlertingAuthorization,
      actionsAuthorization: actionsAuthorization as unknown as ActionsAuthorization,
      spaceId: 'default',
      namespace: 'default',
      getUserName: jest.fn(),
      createAPIKey: jest.fn(),
      logger,
      internalSavedObjectsRepository,
      encryptedSavedObjectsClient: encryptedSavedObjects,
      getActionsClient: jest.fn().mockResolvedValue(mockActionsClient),
      getEventLogClient: jest.fn(),
      kibanaVersion,
      auditLogger,
      maxScheduledPerMinute: 10000,
      minimumScheduleInterval: { value: '1m', enforce: false },
      isAuthenticationTypeAPIKey: jest.fn(),
      getAuthenticationAPIKey: jest.fn(),
      getAlertIndicesAlias: jest.fn(),
      alertsService: null,
      backfillClient,
      isSystemAction: jest.fn(),
      connectorAdapterRegistry: new ConnectorAdapterRegistry(),
      uiSettings: uiSettingsServiceMock.createStartContract(),
    });
    unsecuredSavedObjectsClient.get.mockResolvedValue(mockAdHocRunSO);
  });

  test('should successfully get backfill', async () => {
    const result = await rulesClient.getBackfill('1');

    expect(unsecuredSavedObjectsClient.get).toHaveBeenCalledWith(AD_HOC_RUN_SAVED_OBJECT_TYPE, '1');
    expect(authorization.ensureAuthorized).toHaveBeenCalledWith({
      entity: 'rule',
      consumer: 'myApp',
      operation: 'getBackfill',
      ruleTypeId: 'myType',
    });
    expect(auditLogger.log).toHaveBeenCalledTimes(1);
    expect(auditLogger.log).toHaveBeenCalledWith({
      event: {
        action: 'ad_hoc_run_get',
        category: ['database'],
        outcome: 'success',
        type: ['access'],
      },
      kibana: {
        saved_object: {
          id: '1',
          type: AD_HOC_RUN_SAVED_OBJECT_TYPE,
          name: `backfill for rule "fakeRuleName"`,
        },
      },
      message:
        'User has got ad hoc run for ad_hoc_run_params [id=1] backfill for rule "fakeRuleName"',
    });
    expect(logger.error).not.toHaveBeenCalled();

    expect(result).toEqual(
      transformAdHocRunToBackfillResult({ adHocRunSO: mockAdHocRunSO, isSystemAction })
    );
  });

  test('should successfully get backfill with actions', async () => {
    const mockAdHocRunSOWithActions = {
      ...mockAdHocRunSO,
      attributes: {
        ...mockAdHocRunSO.attributes,
        rule: {
          ...mockAdHocRunSO.attributes.rule,
          actions: [
            {
              uuid: '123abc',
              group: 'default',
              actionRef: 'action_0',
              actionTypeId: 'test',
              params: {},
            },
          ],
        },
      },
      references: [
        { id: 'abc', name: 'rule', type: RULE_SAVED_OBJECT_TYPE },
        { id: '4', name: 'action_0', type: 'action' },
      ],
    };
    unsecuredSavedObjectsClient.get.mockResolvedValue(mockAdHocRunSOWithActions);
    const result = await rulesClient.getBackfill('1');

    expect(unsecuredSavedObjectsClient.get).toHaveBeenCalledWith(AD_HOC_RUN_SAVED_OBJECT_TYPE, '1');
    expect(authorization.ensureAuthorized).toHaveBeenCalledWith({
      entity: 'rule',
      consumer: 'myApp',
      operation: 'getBackfill',
      ruleTypeId: 'myType',
    });
    expect(auditLogger.log).toHaveBeenCalledTimes(1);
    expect(auditLogger.log).toHaveBeenCalledWith({
      event: {
        action: 'ad_hoc_run_get',
        category: ['database'],
        outcome: 'success',
        type: ['access'],
      },
      kibana: {
        saved_object: {
          id: '1',
          type: AD_HOC_RUN_SAVED_OBJECT_TYPE,
          name: `backfill for rule "fakeRuleName"`,
        },
      },
      message:
        'User has got ad hoc run for ad_hoc_run_params [id=1] backfill for rule "fakeRuleName"',
    });
    expect(logger.error).not.toHaveBeenCalled();

    expect(result).toEqual(
      transformAdHocRunToBackfillResult({ adHocRunSO: mockAdHocRunSOWithActions, isSystemAction })
    );
  });

  describe('error handling', () => {
    test('should throw error when getting ad hoc run saved object throws error', async () => {
      unsecuredSavedObjectsClient.get.mockImplementationOnce(() => {
        throw new Error('error getting SO!');
      });
      await expect(rulesClient.getBackfill('1')).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Failed to get backfill by id: 1: error getting SO!"`
      );
      expect(logger.error).toHaveBeenCalledWith(
        `Failed to get backfill by id: 1 - Error: error getting SO!`
      );
    });

    test('should throw error when user does not have access to the rule being backfilled', async () => {
      authorization.ensureAuthorized.mockImplementationOnce(() => {
        throw new Error('no access for you');
      });
      await expect(rulesClient.getBackfill('1')).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Failed to get backfill by id: 1: no access for you"`
      );
      expect(logger.error).toHaveBeenCalledWith(
        `Failed to get backfill by id: 1 - Error: no access for you`
      );

      expect(auditLogger.log).toHaveBeenCalledWith({
        error: { code: 'Error', message: 'no access for you' },
        event: {
          action: 'ad_hoc_run_get',
          category: ['database'],
          outcome: 'failure',
          type: ['access'],
        },
        kibana: {
          saved_object: {
            id: '1',
            type: AD_HOC_RUN_SAVED_OBJECT_TYPE,
            name: 'backfill for rule "fakeRuleName"',
          },
        },
        message:
          'Failed attempt to get ad hoc run for ad_hoc_run_params [id=1] backfill for rule "fakeRuleName"',
      });
    });

    test('should check for errors returned from saved objects client and throw', async () => {
      // @ts-expect-error
      unsecuredSavedObjectsClient.get.mockResolvedValueOnce({
        id: '1',
        type: AD_HOC_RUN_SAVED_OBJECT_TYPE,
        error: {
          error: 'my error',
          message: 'Unable to get',
          statusCode: 404,
        },
        attributes: { rule: { name: fakeRuleName } },
      });

      await expect(rulesClient.getBackfill('1')).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Failed to get backfill by id: 1: Unable to get"`
      );
      expect(logger.error).toHaveBeenCalledWith(
        `Failed to get backfill by id: 1 - Error: Unable to get`
      );

      expect(auditLogger.log).toHaveBeenCalledWith({
        error: { code: 'Error', message: 'Unable to get' },
        event: {
          action: 'ad_hoc_run_get',
          category: ['database'],
          outcome: 'failure',
          type: ['access'],
        },
        kibana: {
          saved_object: {
            id: '1',
            type: AD_HOC_RUN_SAVED_OBJECT_TYPE,
            name: 'backfill for rule "fakeRuleName"',
          },
        },
        message:
          'Failed attempt to get ad hoc run for ad_hoc_run_params [id=1] backfill for rule "fakeRuleName"',
      });
    });
  });
});
