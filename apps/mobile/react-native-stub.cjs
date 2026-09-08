const React = require("react");

function View(props) {
  return React.createElement("View", props, props.children);
}

function Text(props) {
  return React.createElement("Text", props, props.children);
}

function Pressable(props) {
  const { disabled, onPress, ...rest } = props;
  return React.createElement(
    "Pressable",
    {
      ...rest,
      disabled,
      onPress: disabled ? undefined : onPress,
    },
    props.children,
  );
}

function flatten(style) {
  if (style == null) return undefined;
  if (Array.isArray(style)) {
    return Object.assign({}, ...style.map((entry) => flatten(entry) ?? {}));
  }
  return style;
}

const StyleSheet = {
  create: (styles) => styles,
  flatten,
  hairlineWidth: 1,
  absoluteFillObject: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
  absoluteFill: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
};

const Platform = {
  OS: "ios",
  select: (spec) => spec.ios ?? spec.native ?? spec.default,
};

module.exports = {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
};
