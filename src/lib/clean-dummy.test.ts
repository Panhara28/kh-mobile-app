import { applyCleanEnd, applyCleanEvent, CLEAN_IDLE, parseCleanEvents } from './clean-dummy';

const ev = (status: string, progress: number, message: string) => `data: ${JSON.stringify({ status, progress, message })}\n\n`;

describe('parseCleanEvents', () => {
  it('reads the complete events and keeps an unfinished one for the next piece', () => {
    const first = ev('running', 0, 'Starting database pipeline...') + 'data: {"status":"running","progr';
    const a = parseCleanEvents(first);
    expect(a.events).toEqual([{ status: 'running', progress: 0, message: 'Starting database pipeline...' }]);
    const b = parseCleanEvents(a.rest + 'ess":40,"message":"Deleting"}\n\n' + ev('completed', 100, 'Done'));
    expect(b.events.map((e) => [e.status, e.progress])).toEqual([['running', 40], ['completed', 100]]);
    expect(b.rest).toBe('');
  });
  it('skips anything that is not an event and clamps the progress', () => {
    const out = parseCleanEvents(': keep-alive\n\ndata: nope\n\n' + ev('running', 250, 'x') + ev('weird', 1, 'y'));
    expect(out.events).toEqual([{ status: 'running', progress: 100, message: 'x' }]);
  });
  it('reads Windows line endings', () => {
    expect(parseCleanEvents('data: {"status":"failed","progress":0,"message":"No"}\r\n\r\n').events[0]?.status).toBe('failed');
  });
});

describe('the screen state', () => {
  it('follows the events, logging each message once', () => {
    let s = applyCleanEvent(CLEAN_IDLE, { status: 'running', progress: 0, message: 'Counting' });
    s = applyCleanEvent(s, { status: 'running', progress: 0, message: 'Counting' });
    s = applyCleanEvent(s, { status: 'completed', progress: 100, message: 'Done' });
    expect(s).toEqual({ status: 'completed', progress: 100, message: 'Done', logs: ['Counting', 'Done'] });
  });
  it('calls a stream that stops without a final event a failure, but not one that finished', () => {
    const running = applyCleanEvent(CLEAN_IDLE, { status: 'running', progress: 30, message: 'Deleting' });
    expect(applyCleanEnd(running).status).toBe('failed');
    const done = applyCleanEvent(CLEAN_IDLE, { status: 'completed', progress: 100, message: 'Done' });
    expect(applyCleanEnd(done)).toBe(done);
  });
});
