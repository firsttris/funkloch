import { describe, expect, test } from 'vitest'
import { redactMessage } from './matter'
import { REDACTED } from './redact'

describe('redactMessage', () => {
  test('drops serial numbers, unique ids and certificates, keeps what Funkloch reads', () => {
    const node = {
      node_id: 7,
      attributes: {
        '0/40/3': 'Eve Energy',
        '0/40/15': 'SN123',
        '0/40/18': 'abc',
        '0/62/1': ['cert'],
        '0/53/7': [{ '0': 1, '6': -60 }],
      },
    }
    expect(redactMessage({ message_id: '1', result: [node] })).toEqual({
      message_id: '1',
      result: [
        {
          node_id: 7,
          attributes: {
            '0/40/3': 'Eve Energy',
            '0/40/15': REDACTED,
            '0/40/18': REDACTED,
            '0/62/1': REDACTED,
            '0/53/7': [{ '0': 1, '6': -60 }],
          },
        },
      ],
    })
  })

  test('in a read answer and in an attribute report too', () => {
    expect(redactMessage({ message_id: '2', result: { '0/40/15': 'SN', '0/54/4': -61 } })).toEqual({
      message_id: '2',
      result: { '0/40/15': REDACTED, '0/54/4': -61 },
    })
    expect(redactMessage({ event: 'attribute_updated', data: [7, '0/62/0', ['noc']] })).toEqual({
      event: 'attribute_updated',
      data: [7, '0/62/0', REDACTED],
    })
  })
})
