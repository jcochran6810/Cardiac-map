import { beforeEach, describe, expect, it } from 'vitest';
import { answeredSoFar, useQuizStore } from '@/store/useQuizStore';
import { useAppStore } from '@/store/useAppStore';
import { useECGStore } from '@/store/useECGStore';
import { useTimelineStore } from '@/store/useTimelineStore';
import { endQuizStrips, showQuizStrip } from '@/lib/actions';
import { showRhythm } from '@/lib/rhythm';
import type { QuizQuestion } from '@/types/content';
import { frame, monitor } from './helpers';

const question = (id: string, correctIndex = 1): QuizQuestion => ({
  id, question: `Question ${id}?`, options: ['A', 'B', 'C', 'D'], correctIndex, explanation: 'Because.', level: 2, topic: 'ecg',
} as QuizQuestion);
const round = () => useQuizStore.getState();

beforeEach(() => {
  round().end();
});

describe('a quiz round', () => {
  it('scores each question once, and moves on only after an answer', () => {
    round().start([question('a'), question('b'), question('c')]);
    expect(round()).toMatchObject({ idx: 0, choice: null, score: 0 });
    // not answered yet: Next does nothing
    round().next();
    expect(round().idx).toBe(0);
    expect(round().pick(1)).toBe(true);
    // a second tap on another option changes nothing
    expect(round().pick(2)).toBeNull();
    expect(round()).toMatchObject({ choice: 1, score: 1 });
    expect(answeredSoFar(round())).toBe(1);
    round().next();
    expect(round()).toMatchObject({ idx: 1, choice: null });
    expect(round().pick(0)).toBe(false);
    expect(round().score).toBe(1);
    round().next();
    round().pick(1);
    round().next();
    // the results: every question answered, nothing left to pick
    expect(round().idx).toBe(3);
    expect(answeredSoFar(round())).toBe(3);
    expect(round().pick(1)).toBeNull();
    round().next();
    expect(round().idx).toBe(3);
  });

  it('ignores an option that does not exist', () => {
    round().start([question('a')]);
    expect(round().pick(7)).toBeNull();
    expect(round().pick(-1)).toBeNull();
    expect(round().choice).toBeNull();
  });

  it('survives the quiz closing (×, Back or the tutor opening) and ends only when asked', () => {
    useAppStore.setState({ quizOpen: true });
    round().start([question('a'), question('b')]);
    round().pick(1);
    round().next();
    useAppStore.getState().setQuizOpen(false);
    useAppStore.getState().setQuizOpen(true);
    expect(round()).toMatchObject({ idx: 1, score: 1, choice: null });
    expect(round().deck?.map((q) => q.id)).toEqual(['a', 'b']);
    round().end();
    expect(round()).toMatchObject({ deck: null, idx: 0, choice: null, score: 0 });
    expect(answeredSoFar(round())).toBe(0);
  });
});

describe('a quiz strip on the monitor', () => {
  beforeEach(() => {
    endQuizStrips();
    useAppStore.setState({ mode: 'learn', phone: false, short: false, compact: false, heart: 'closed', ecg: 'closed' });
    useECGStore.setState({ bottomView: 'wiggers', electrodeLab: true, inspectLead: 'V1' });
    useTimelineStore.setState({ playing: false, speed: 1 });
    showRhythm('normal-sinus');
    frame();
  });

  it('plays live, and sets the ECG drawer to the plain 12-lead so the strip is what it shows when it is up', () => {
    useECGStore.setState({ electrodeLab: false });
    showQuizStrip('vt', 170);
    expect(monitor()).toBe('vt@170');
    expect(useECGStore.getState()).toMatchObject({ bottomView: 'ecg', inspectLead: null });
    expect(useTimelineStore.getState().playing).toBe(true);
    endQuizStrips();
    expect(monitor()).toBe('normal-sinus@72');
  });

  it('never moves a drawer, a tool or the screen itself (the quiz card draws the strip; Back has nothing extra to undo)', () => {
    showQuizStrip('vt', 170);
    expect(useAppStore.getState()).toMatchObject({ mode: 'learn', ecg: 'closed', heart: 'closed' });
    // the electrode lab stays where the learner left it
    expect(useECGStore.getState().electrodeLab).toBe(true);
    useAppStore.setState({ ecg: 'full' });
    showQuizStrip('atrial-flutter', 150);
    expect(useAppStore.getState().ecg).toBe('full');
    useAppStore.setState({ mode: 'home', ecg: 'closed' });
    showQuizStrip('vf');
    expect(useAppStore.getState()).toMatchObject({ mode: 'home', ecg: 'closed' });
  });
});
