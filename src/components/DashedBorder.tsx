import React, { useState } from 'react';
import { View, LayoutChangeEvent, StyleSheet } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

interface DashedBorderProps {
  radius: number;
  children: React.ReactNode;
}

export default function DashedBorder({ radius, children }: DashedBorderProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  };

  return (
    <View onLayout={onLayout}>
      {size.width > 0 && (
        <Svg style={StyleSheet.absoluteFill} width={size.width} height={size.height}>
          <Rect
            x={0.75}
            y={0.75}
            width={size.width - 1.5}
            height={size.height - 1.5}
            rx={radius}
            stroke="#C7C3B9"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            fill="none"
          />
        </Svg>
      )}
      {children}
    </View>
  );
}
