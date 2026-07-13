export type ProjectEventType = 'created' | 'updated' | 'renamed' | 'archived' | 'deleted' | 'restored';

export type ProjectEvent = {
  id: number;
  type: ProjectEventType;
  projectId: string;
  version: number;
  name: string;
  updated_at: string;
};

type Listener = (event: ProjectEvent) => void;

const listeners = new Set<Listener>();
let lastEventId = 0;

export function publishProjectEvent(event: Omit<ProjectEvent, 'id'>) {
  const nextEvent = {
    ...event,
    id: ++lastEventId,
  };

  for (const listener of listeners) {
    listener(nextEvent);
  }

  return nextEvent;
}

export function subscribeProjectEvents(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
