import React from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Wordmark from './Wordmark';
import Watermark from './Watermark';

interface ScreenHeaderProps {
  /**
   * SPEC §2 lists brand/titled/tab-title. 'profile' is the Account header — a navy
   * block with an initials avatar; same family, so it lives here rather than being
   * inlined as raw navy markup in the screen.
   */
  variant: 'brand' | 'titled' | 'tab-title' | 'profile';
  title?: string;
  /** 'profile' only — initials for the 52px avatar. */
  initials?: string;
  subtitle?: string;
  onBack?: () => void;
  /** Search row. Static affordance by default; pass onSearchChange to make it a live input. */
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (text: string) => void;
  showWatermark?: boolean;
  /** 'titled' only — reference uses 22 on screens 4/5, 20 on screen 7. */
  titleSize?: number;
  /** 'titled' only — reference uses 4 on screen 5, 3 on screen 7. */
  subtitleMarginTop?: number;
}

const NAVY = '#1B2B3A';

export default function ScreenHeader({
  variant,
  title,
  initials,
  subtitle,
  onBack,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  showWatermark = false,
  titleSize = 22,
  subtitleMarginTop = 4,
}: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  // The reference draws a 44px status row inside the navy block. We reserve the
  // real inset instead, with 44 as the floor so header proportions hold.
  const statusRow = Math.max(insets.top, 44);

  if (variant === 'brand') {
    return (
      <View
        style={{
          backgroundColor: NAVY,
          paddingTop: statusRow,
          paddingHorizontal: 22,
          paddingBottom: 22,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {showWatermark && <Watermark top={23} right={20} size={120} />}
        <View style={{ marginTop: 12 }}>
          <Wordmark size="md" surface="navy" />
        </View>
        <Text
          style={{
            fontFamily: 'IBMPlexMono-400',
            fontSize: 8.5,
            lineHeight: 8.5,
            color: '#7FC4D6',
            marginTop: 9,
            paddingLeft: 2.5,
            textTransform: 'uppercase',
          }}
        >
          By Investigations Differently
        </Text>
      </View>
    );
  }

  if (variant === 'tab-title') {
    return (
      <View
        style={{
          backgroundColor: NAVY,
          paddingTop: statusRow,
          paddingHorizontal: 20,
          paddingBottom: 18,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {showWatermark && <Watermark top={20} right={-24} size={130} />}
        <Text
          style={{
            fontFamily: 'Archivo-800',
            fontSize: 26,
            letterSpacing: -0.52,
            color: '#FFFFFF',
            marginTop: 6,
          }}
        >
          {title}
        </Text>
        {subtitle && (
          <Text
            style={{
              fontFamily: 'PublicSans-400',
              fontSize: 12,
              color: '#9FB2B8',
              marginTop: 5,
            }}
          >
            {subtitle}
          </Text>
        )}
        {searchPlaceholder && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              backgroundColor: '#22333F',
              borderRadius: 11,
              paddingHorizontal: 12,
              paddingVertical: 10,
              marginTop: 14,
            }}
          >
            <View
              style={{
                width: 11,
                height: 11,
                borderRadius: 5.5,
                borderWidth: 1.5,
                borderColor: '#7F929A',
              }}
            />
            {onSearchChange ? (
              <TextInput
                value={searchValue ?? ''}
                onChangeText={onSearchChange}
                placeholder={searchPlaceholder}
                placeholderTextColor="#7F929A"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                style={{
                  fontFamily: 'PublicSans-400',
                  fontSize: 13,
                  color: '#E8EEF0',
                  flex: 1,
                  padding: 0,
                }}
              />
            ) : (
              <Text style={{ fontFamily: 'PublicSans-400', fontSize: 13, color: '#7F929A' }}>
                {searchPlaceholder}
              </Text>
            )}
          </View>
        )}
      </View>
    );
  }

  if (variant === 'profile') {
    return (
      <View
        style={{
          backgroundColor: NAVY,
          paddingTop: statusRow,
          paddingHorizontal: 20,
          paddingBottom: 20,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {showWatermark && <Watermark top={20} right={-24} size={130} />}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 13,
            marginTop: 8,
          }}
        >
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: '#2A3B43',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontFamily: 'Archivo-800', fontSize: 17, color: '#7FC4D6' }}>
              {initials}
            </Text>
          </View>
          <View>
            <Text
              style={{
                fontFamily: 'Archivo-800',
                fontSize: 19,
                letterSpacing: -0.38,
                color: '#FFFFFF',
              }}
            >
              {title}
            </Text>
            {subtitle && (
              <Text
                style={{
                  fontFamily: 'PublicSans-400',
                  fontSize: 12,
                  color: '#9FB2B8',
                  marginTop: 2,
                }}
              >
                {subtitle}
              </Text>
            )}
          </View>
        </View>
      </View>
    );
  }

  // titled
  return (
    <View
      style={{
        backgroundColor: NAVY,
        paddingTop: statusRow,
        paddingHorizontal: 20,
        paddingBottom: 16,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {onBack && (
          <Pressable onPress={onBack} hitSlop={12}>
            <Text style={{ fontSize: 20, lineHeight: 20, color: '#C6D4D9' }}>‹</Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: 'Archivo-800',
              fontSize: titleSize,
              letterSpacing: titleSize * -0.02,
              color: '#FFFFFF',
            }}
          >
            {title}
          </Text>
          {subtitle && (
            <Text
              style={{
                fontFamily: 'IBMPlexMono-400',
                fontSize: 9.5,
                color: '#7FC4D6',
                marginTop: subtitleMarginTop,
              }}
            >
              {subtitle}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}
