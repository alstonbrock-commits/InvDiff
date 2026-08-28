import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TextStyle,
  TextInputProps,
  Pressable,
} from 'react-native';
import Svg, { Path, Circle, Line } from 'react-native-svg';

// The standard show/hide password eye. Feather-style outline glyphs drawn
// inline — no icon library in this project.
function EyeIcon({ off, color }: { off: boolean; color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      {off ? (
        <>
          <Path
            d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Line
            x1={1}
            y1={1}
            x2={23}
            y2={23}
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
          />
        </>
      ) : (
        <>
          <Path
            d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={2} />
        </>
      )}
    </Svg>
  );
}

interface FieldProps {
  label: string;
  variant?: 'light' | 'navy';
  value?: string;
  onChangeText?: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  multiline?: boolean;
  /** multiline only — visible line count; Android caps the box height to it. */
  numberOfLines?: number;
  /** RN default is 'sentences' — set 'none' for emails, names, ids. */
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoCorrect?: boolean;
  keyboardType?: TextInputProps['keyboardType'];
  editable?: boolean;
  /** Per-instance overrides, e.g. the Login password's #8A9499 + tracking. */
  inputStyle?: TextStyle;
}

const VARIANTS = {
  light: {
    label: '#5D6B70',
    labelFamily: 'PublicSans-700',
    background: '#FFFFFF',
    border: '#E5E3DC',
    text: '#17262D',
    radius: 11,
    padding: 12,
    fontSize: 13.5,
  },
  navy: {
    label: '#9FB2B8',
    labelFamily: 'PublicSans-600',
    background: '#22333F',
    // Reference: #33475266 — #334752 at 0x66 (40%) alpha.
    border: 'rgba(51,71,82,0.4)',
    text: '#FFFFFF',
    radius: 12,
    padding: 13,
    fontSize: 14,
  },
} as const;

export default function Field({
  label,
  variant = 'light',
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  multiline = false,
  numberOfLines,
  autoCapitalize,
  autoCorrect,
  keyboardType,
  editable,
  inputStyle,
}: FieldProps) {
  const v = VARIANTS[variant];
  // Secure fields get the standard eye toggle; revealed text drops any
  // caller-set dot tracking (e.g. Login's letterSpacing) so it reads normally.
  const [hidden, setHidden] = useState(true);

  return (
    <View>
      <Text
        style={{
          fontFamily: v.labelFamily,
          fontSize: 11,
          color: v.label,
          marginBottom: 6,
        }}
      >
        {label}
      </Text>
      <View style={{ position: 'relative' }}>
        <TextInput
          style={[
            {
              backgroundColor: v.background,
              borderRadius: v.radius,
              borderWidth: 1,
              borderColor: v.border,
              paddingHorizontal: variant === 'navy' ? 14 : v.padding,
              paddingVertical: v.padding,
              fontFamily: 'PublicSans-400',
              fontSize: v.fontSize,
              color: v.text,
            },
            // Reference sets height:56 + overflow:hidden. On Android a fixed height
            // makes TextInput centre the overflow, slicing the first line mid-glyph,
            // so we use it as a floor and let the field grow instead of clipping.
            multiline && { minHeight: 56, textAlignVertical: 'top', paddingTop: 12 },
            inputStyle,
            secureTextEntry && { paddingRight: 44 },
            secureTextEntry && !hidden && { letterSpacing: 0 },
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#8A9499"
          secureTextEntry={secureTextEntry && hidden}
          multiline={multiline}
          numberOfLines={multiline ? (numberOfLines ?? 4) : 1}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          keyboardType={keyboardType}
          editable={editable}
        />
        {secureTextEntry && (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
            style={{
              position: 'absolute',
              right: 12,
              top: 0,
              bottom: 0,
              justifyContent: 'center',
            }}
          >
            <EyeIcon off={!hidden} color={v.label} />
          </Pressable>
        )}
      </View>
    </View>
  );
}
