import { describe, expect, it } from 'vitest';
import { decide } from './host-watch.mjs';

describe('decide', () => {
  it('says nothing while the window is open and the host runs', () => {
    expect(decide({ actionsEnabled: true, instanceState: 'running' })).toEqual({
      shouldBeUp: true,
      running: true,
      value: 0,
    });
  });

  it('raises the metric while the window is open and the host is stopped', () => {
    expect(decide({ actionsEnabled: true, instanceState: 'stopped' })).toEqual({
      shouldBeUp: true,
      running: false,
      value: 1,
    });
  });

  it.each(['stopping', 'shutting-down', 'terminated', 'pending', 'missing'])(
    'treats %s inside the window as not running',
    (instanceState) => {
      expect(decide({ actionsEnabled: true, instanceState }).value).toBe(1);
    }
  );

  it.each(['running', 'stopped', 'stopping', 'pending', 'missing'])(
    'stays quiet in any state while the window is closed: %s',
    (instanceState) => {
      expect(decide({ actionsEnabled: false, instanceState }).value).toBe(0);
    }
  );

  it('reports whether the host should be up separately from whether it is', () => {
    expect(decide({ actionsEnabled: false, instanceState: 'stopped' })).toEqual({
      shouldBeUp: false,
      running: false,
      value: 0,
    });
  });

  it.each([undefined, null, 'True', 1, 0])(
    'refuses to answer when ActionsEnabled reads as %s',
    (actionsEnabled) => {
      expect(() => decide({ actionsEnabled, instanceState: 'running' })).toThrow(/ActionsEnabled/);
    }
  );

  it.each([undefined, null, '', '   ', 42])(
    'refuses to answer when the instance state reads as %s',
    (instanceState) => {
      expect(() => decide({ actionsEnabled: true, instanceState })).toThrow(/instance state/);
    }
  );
});
