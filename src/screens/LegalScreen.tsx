import React from 'react';
import { View, ScrollView, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ScreenHeader } from '@/components';
import { LEGAL_UPDATED, type LegalSection } from '@/fixtures/legal';

interface LegalScreenProps {
  title: string;
  sections: LegalSection[];
}

// Screens 12 and 13 share this layout exactly; only title and sections differ.
export default function LegalScreen({ title, sections }: LegalScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: '#F6F5F1' }}>
      <ScreenHeader
        variant="titled"
        title={title}
        subtitle={`LAST UPDATED ${LEGAL_UPDATED}`.toUpperCase()}
        subtitleMarginTop={3}
        onBack={() => router.back()}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: 18,
          paddingHorizontal: 20,
          paddingBottom: 24 + insets.bottom,
          gap: 16,
        }}
      >
        {sections.map((section) => (
          <View key={section.heading}>
            <Text
              style={{
                fontFamily: 'Archivo-700',
                fontSize: 14,
                color: '#17262D',
                marginBottom: 6,
              }}
            >
              {section.heading}
            </Text>
            <Text
              style={{
                fontFamily: 'PublicSans-400',
                fontSize: 12.5,
                lineHeight: 19.4,
                color: '#5D6B70',
              }}
            >
              {section.body}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
