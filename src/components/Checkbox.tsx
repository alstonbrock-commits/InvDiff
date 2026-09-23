import React from 'react';
import { Pressable, View, Text } from 'react-native';

interface CheckboxProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  /** Smaller supporting line under the label. */
  hint?: string;
  variant?: 'light' | 'navy';
  disabled?: boolean;
}

const VARIANTS = {
  light: { label: '#17262D', hint: '#5D6B70', border: '#C7C3B9', box: '#FFFFFF' },
  navy: { label: '#E8EEF0', hint: '#7F929A', border: 'rgba(159,178,184,0.45)', box: '#22333F' },
} as const;

export default function Checkbox({
  checked,
  onChange,
  label,
  hint,
  variant = 'light',
  disabled = false,
}: CheckboxProps) {
  const v = VARIANTS[variant];
  return (
    <Pressable
      onPress={() => !disabled && onChange(!checked)}
      disabled={disabled}
      hitSlop={6}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 11,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <View
        style={{
          width: 21,
          height: 21,
          borderRadius: 6,
          borderWidth: checked ? 0 : 1.5,
          borderColor: v.border,
          backgroundColor: checked ? '#E4772A' : v.box,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 1,
        }}
      >
        {checked && (
          <Text style={{ fontFamily: 'Archivo-800', fontSize: 12, color: '#FFFFFF' }}>
            ✓
          </Text>
        )}
      </View>

      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: 'PublicSans-400',
            fontSize: 12.5,
            lineHeight: 17.5,
            color: v.label,
          }}
        >
          {label}
        </Text>
        {!!hint && (
          <Text
            style={{
              fontFamily: 'PublicSans-400',
              fontSize: 11,
              lineHeight: 15,
              color: v.hint,
              marginTop: 3,
            }}
          >
            {hint}
          </Text>
        )}
      </View>
    </Pressable>
  );
}
