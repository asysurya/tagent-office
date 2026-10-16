/**
 * Path: apps/web/src/components/directive/directive-input.tsx
 * Purpose: The CEO's command line — a textarea with Enter-to-send,
 *          Shift+Enter newline, 2000-char cap, and a pending state.
 * Dependencies: @tanstack/react-query, ui/button, ui/card, ui/textarea, @/lib/api
 */
'use client';

import { useState, type KeyboardEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/input';
import { submitDirective } from '@/lib/api';

const MAX_CHARS = 2_000;

/** Directive composer. */
export function DirectiveInput(): React.JSX.Element {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: submitDirective,
    onSuccess: () => {
      setText('');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['directives'] });
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const canSend = text.trim().length > 0 && !mutation.isPending;

  function send(): void {
    if (!canSend) return;
    mutation.mutate(text.trim());
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Directive</CardTitle>
        <CardDescription>Tell your office what to do. The Manager breaks it into todos.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value.slice(0, MAX_CHARS))}
          onKeyDown={onKeyDown}
          placeholder="e.g. Create a hello.txt file with content 'hello world'"
          aria-label="Directive text"
          disabled={mutation.isPending}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-zinc-500">
            {text.length}/{MAX_CHARS} · Enter to send, Shift+Enter for a new line
          </span>
          <Button size="sm" onClick={send} disabled={!canSend}>
            {mutation.isPending ? 'Sending…' : 'Send directive'}
          </Button>
        </div>
        {error !== null ? <p className="text-xs text-red-400">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
