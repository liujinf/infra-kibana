/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render } from '@testing-library/react';

import type { PivotGroupByConfig } from '../../../../common';
import { PIVOT_SUPPORTED_GROUP_BY_AGGS } from '../../../../common';

import { GroupByListForm } from './list_form';

describe('Transform: <GroupByListForm />', () => {
  test('Minimal initialization', () => {
    const item: PivotGroupByConfig = {
      agg: PIVOT_SUPPORTED_GROUP_BY_AGGS.TERMS,
      field: 'the-group-by-field',
      aggName: 'the-group-by-agg-name',
      dropDownName: 'the-group-by-drop-down-name',
    };
    const props = {
      list: { 'the-options-data-id': item },
      options: {},
      deleteHandler() {},
      onChange() {},
    };

    const { container } = render(<GroupByListForm {...props} />);

    expect(container.textContent).toContain('the-group-by-agg-name');
  });
});
