import * as React from "react";

type PossibleRef<T> = React.Ref<T> | undefined;

function setRef<T>(ref: PossibleRef<T>, value: T) {
  if (typeof ref === "function") {
    return ref(value);
  } else if (ref !== null && ref !== undefined) {
    (ref as React.MutableRefObject<T>).current = value;
  }
}

function composeRefs<T>(...refs: PossibleRef<T>[]): React.RefCallback<T> {
  return (node: T) => {
    let hasCleanup = false;
    const cleanups = refs.map((ref) => {
      const cleanup = setRef(ref, node);
      if (!hasCleanup && typeof cleanup === "function") {
        hasCleanup = true;
      }
      return cleanup;
    });
    if (hasCleanup) {
      return () => {
        for (let i = 0; i < cleanups.length; i++) {
          const cleanup = cleanups[i];
          if (typeof cleanup === "function") {
            cleanup();
          } else {
            setRef(refs[i], null as unknown as T);
          }
        }
      };
    }
  };
}

/**
 * React 19-safe useComposedRefs that keeps a stable callback identity across renders
 * even when callers (like @radix-ui/react-select or @radix-ui/react-slot) pass inline
 * arrow functions such as `(node) => setState(node)`.
 */
function useComposedRefs<T>(...refs: PossibleRef<T>[]): React.RefCallback<T> {
  const refsRef = React.useRef(refs);
  refsRef.current = refs;
  return React.useCallback((node: T) => {
    return composeRefs(...refsRef.current)(node);
  }, []);
}

export { composeRefs, useComposedRefs };
