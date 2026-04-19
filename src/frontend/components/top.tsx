import type { FC } from "hono/jsx";

export const TopView: FC<{ messages: string[] }> = (props) => {
  return (
    <>
      <h1>Hello Hono!</h1>
      <ul>
        {props.messages.map((message) => {
          return <li>{message}!!</li>;
        })}
      </ul>
    </>
  );
};
