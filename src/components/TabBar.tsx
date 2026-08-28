import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

// Covers both navigators: facilitator (dashboard/events/insights/[team]/account)
// and admin (dashboard/reports/users/settings).
const LABELS: Record<string, string> = {
  '(dashboard)': 'Dashboard',
  '(events)': 'Events',
  '(insights)': 'Insights',
  '(team)': 'Team',
  '(account)': 'Account',
  '(reports)': 'Reports',
  '(users)': 'Users',
  '(settings)': 'Settings',
};

export default function TabBar({ state, navigation, descriptors }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  // expo-router hides a tab declared with href={null} by styling its item
  // display:none — a custom bar has to honour that itself (Team tab is
  // supervisor-only).
  const visible = state.routes.filter((route) => {
    const style = descriptors[route.key]?.options.tabBarItemStyle as
      | { display?: string }
      | undefined;
    return style?.display !== 'none';
  });

  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-around',
        backgroundColor: '#FFFFFF',
        borderTopWidth: 1,
        borderTopColor: '#E5E3DC',
        paddingTop: 12,
        paddingBottom: 16 + insets.bottom,
      }}
    >
      {visible.map((route) => {
        const focused = state.routes[state.index]?.key === route.key;
        const label = LABELS[route.name] ?? route.name;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityState={focused ? { selected: true } : {}}
            accessibilityLabel={label}
            style={{ alignItems: 'center', gap: 5 }}
          >
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                backgroundColor: focused ? '#E4772A' : '#D8DDDE',
              }}
            />
            <Text
              style={{
                fontFamily: 'PublicSans-600',
                fontSize: 9.5,
                color: focused ? '#E4772A' : '#8A9499',
              }}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
