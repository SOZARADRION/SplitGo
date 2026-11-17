import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { errorMessage } from "./api";

interface State<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

/**
 * Carrega dados sempre que a tela ganha foco (ex.: ao voltar de "Nova despesa").
 * `load` precisa ser estável (useCallback no chamador).
 */
export function useFocusData<T>(load: () => Promise<T>) {
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: true });

  const run = useCallback(
    (isActive: () => boolean) =>
      load().then(
        (data) => {
          if (isActive()) setState({ data, error: null, loading: false });
        },
        (err) => {
          if (isActive()) setState((s) => ({ ...s, error: errorMessage(err), loading: false }));
        },
      ),
    [load],
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      run(() => active);
      return () => {
        active = false;
      };
    }, [run]),
  );

  const reload = useCallback(() => run(() => true), [run]);
  return { ...state, reload };
}
