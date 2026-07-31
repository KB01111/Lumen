import {useEffect, useRef, useState} from 'react';

import type {SearchService} from '../../services/search/search-service';
import {
  filePreviewSchema,
  searchErrorSchema,
  type FilePreview,
  type SearchError,
} from '../../services/search/search.types';

export type PreviewLifecycle = 'idle' | 'loading' | 'ready' | 'error';

export interface PreviewController {
  error: SearchError | null;
  lifecycle: PreviewLifecycle;
  preview: FilePreview | null;
}

function previewFailure(error: unknown): SearchError {
  const parsed = searchErrorSchema.safeParse(error);
  if (parsed.success) {
    return parsed.data;
  }
  return {
    code: 'preview-failed',
    message: error instanceof Error ? error.message : 'This preview could not be loaded.',
    recoverable: true,
  };
}

function invalidPreviewError(): SearchError {
  return {
    code: 'invalid-response',
    message: 'The preview provider returned an invalid response.',
    recoverable: true,
  };
}

export function usePreviewController(
  fileId: string | null,
  service: SearchService,
): PreviewController {
  const [state, setState] = useState<PreviewController>({
    error: null,
    lifecycle: 'idle',
    preview: null,
  });
  const requestSequence = useRef(0);

  useEffect(() => {
    const requestId = ++requestSequence.current;
    if (!fileId) {
      setState({error: null, lifecycle: 'idle', preview: null});
      return;
    }

    const abortController = new AbortController();
    setState({error: null, lifecycle: 'loading', preview: null});

    void service
      .getPreview(fileId, abortController.signal)
      .then((response) => {
        if (requestId !== requestSequence.current || abortController.signal.aborted) {
          return;
        }
        const parsed = filePreviewSchema.safeParse(response);
        if (!parsed.success || parsed.data.fileId !== fileId) {
          setState({error: invalidPreviewError(), lifecycle: 'error', preview: null});
          return;
        }
        setState({error: null, lifecycle: 'ready', preview: parsed.data});
      })
      .catch((error: unknown) => {
        if (requestId !== requestSequence.current || abortController.signal.aborted) {
          return;
        }
        setState({error: previewFailure(error), lifecycle: 'error', preview: null});
      });

    return () => abortController.abort();
  }, [fileId, service]);

  return state;
}
