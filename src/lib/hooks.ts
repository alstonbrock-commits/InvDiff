import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, type KeyboardEvent } from 'react-native';
import { useFocusEffect } from 'expo-router';

/**
 * Height of the soft keyboard while it's visible, else 0. Applied as extra
 * bottom padding on form screens so the focused field stays clear of the
 * keyboard — needed because adjustResize doesn't reach transparent modals,
 * and sticky footers can sit over the resized scroll area.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e: KeyboardEvent) =>
      setHeight(e.endCoordinates?.height ?? 0),
    );
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

/**
 * Runs an async loader whenever the screen gains focus (and on demand via
 * `reload`). SQLite reads aren't reactive, so capture-path screens re-query on
 * focus — cheap at this data size, and it keeps every screen current after a
 * mutation elsewhere in the stack.
 */
export function useFocusData<T>(
  load: () => Promise<T>,
  deps: React.DependencyList = [],
): { data: T | null; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  const run = useCallback(() => {
    const mySeq = ++seq.current;
    load()
      .then((d) => {
        if (seq.current === mySeq) {
          setData(d);
          setLoading(false);
        }
      })
      .catch(() => {
        if (seq.current === mySeq) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useFocusEffect(
    useCallback(() => {
      run();
    }, [run]),
  );

  return { data, loading, reload: run };
}
