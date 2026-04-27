import type { FC } from "hono/jsx";

export type SkeletonProps = {
  count?: number;
  height?: string | number;
  width?: string | number;
  circle?: boolean;
  className?: string;
  style?: Record<string, string | number>;
};

export const Skeleton: FC<SkeletonProps> = (props) => {
  const {
    count = 1,
    height,
    width,
    circle,
    className = "",
    style = {},
  } = props;

  const elements = [];
  for (let i = 0; i < count; i++) {
    const inlineStyle: Record<string, string | number> = { ...style };
    if (width !== undefined) inlineStyle.width = width;
    if (height !== undefined) inlineStyle.height = height;
    if (circle) inlineStyle.borderRadius = "50%";

    elements.push(
      <span
        key={i}
        class={`react-loading-skeleton ${className}`}
        style={inlineStyle}
      >
        &zwnj;
      </span>
    );
  }

  return (
    <span
      class="react-loading-skeleton-wrapper"
      style={{
        display: "block",
        lineHeight: "1",
      }}
    >
      {elements}
    </span>
  );
};

export type SkeletonThemeProps = {
  baseColor?: string;
  highlightColor?: string;
  children?: any;
};

export const SkeletonTheme: FC<SkeletonThemeProps> = (props) => {
  const style: Record<string, string> = {};
  if (props.baseColor) style["--base-color"] = props.baseColor;
  if (props.highlightColor) style["--highlight-color"] = props.highlightColor;

  return (
    <div style={style}>
      {props.children}
    </div>
  );
};
