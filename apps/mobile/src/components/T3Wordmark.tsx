import type { ColorValue } from "react-native";
import Svg, { Path } from "react-native-svg";
import { withUniwind } from "uniwind";

const ThemedPath = withUniwind(Path);

export function T3Wordmark(props: {
  readonly height: number;
  readonly color?: ColorValue;
  readonly colorClassName?: string;
}) {
  const aspectRatio = 25.2 / 20;
  return (
    <Svg
      accessibilityLabel="AmICited"
      height={props.height}
      width={props.height * aspectRatio}
      viewBox="5 6 25.2 20"
    >
      <ThemedPath
        d="M5 19H9.2V26H5ZM12 15H16.2V26H12ZM19 11H23.2V26H19ZM26 6H30.2V26H26Z"
        color={props.color}
        colorClassName={props.colorClassName}
        fill="currentColor"
      />
    </Svg>
  );
}
