import type { Course } from '@/types/course';

/** PLACEHOLDER — this course is being written. */
export const HEMODYNAMICS: Course = {
  id: 'hemodynamics',
  title: 'Pressure, volume and heart sounds',
  summary: 'This course is being written and will appear here shortly.',
  roles: [2, 3, 4, 5],
  level: 'advanced',
  draft: true,
  lessons: [
    {
      id: 'placeholder',
      title: 'Coming soon',
      goal: 'This lesson is being written and will appear here shortly.',
      minutes: 2,
      steps: [
        { title: 'Coming soon', text: ['This lesson is being written and will appear here shortly.'], show: { heart: 'external' } },
        { title: 'Coming soon', text: ['This lesson is being written and will appear here shortly.'], check: { kind: 'choice', question: 'Placeholder question one?', options: ['Yes', 'No'], answer: 0, explain: 'This is a placeholder explanation.' } },
        { title: 'Coming soon', text: ['This lesson is being written and will appear here shortly.'], check: { kind: 'choice', question: 'Placeholder question two?', options: ['Yes', 'No'], answer: 0, explain: 'This is a placeholder explanation.' } },
        { title: 'Coming soon', text: ['This lesson is being written and will appear here shortly.'] },
      ],
    },
  ],
};
