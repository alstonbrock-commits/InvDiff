import React from 'react';
import { Pressable, Text, View, ViewStyle } from 'react-native';

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'danger-ghost';
  /** Reference uses 15/15 on Login, 14/14 for in-body CTAs. */
  size?: 'sm' | 'md';
  onPress?: () => void;
  children: string;
  fullWidth?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export default function Button({
  variant = 'primary',
  size = 'md',
  onPress,
  children,
  fullWidth = false,
  disabled = false,
  style,
}: ButtonProps) {
  const metrics = size === 'sm' ? 14 : 15;
  const variants: Record<string, { backgroundColor: string; borderWidth: number; borderColor?: string }> = {
    primary: {
      backgroundColor: '#E4772A',
      borderWidth: 0,
    },
    secondary: {
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: '#C7C3B9',
    },
    'danger-ghost': {
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: '#E5D2C2',
    },
  };

  const textColors = {
    primary: '#FFFFFF',
    secondary: '#5D6B70',
    'danger-ghost': '#E4772A',
  };

  const config = variants[variant];
  const textColor = textColors[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          backgroundColor: config.backgroundColor,
          borderWidth: config.borderWidth,
          borderColor: config.borderColor,
          borderRadius: 12,
          paddingHorizontal: metrics,
          paddingVertical: metrics,
          justifyContent: 'center',
          alignItems: 'center',
          width: fullWidth ? '100%' : 'auto',
          opacity: pressed ? 0.8 : disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      <Text
        style={{
          fontFamily: 'Archivo-700',
          fontSize: metrics,
          color: textColor,
        }}
      >
        {children}
      </Text>
    </Pressable>
  );
}
