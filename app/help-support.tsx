import React, { useState } from 'react';
import { View, ScrollView, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ScreenHeader, ListCard, Eyebrow } from '@/components';
import { FAQS, SUPPORT_EMAIL } from '@/fixtures/legal';

export default function HelpSupport() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(0);

  return (
    <View style={{ flex: 1, backgroundColor: '#F6F5F1' }}>
      <ScreenHeader variant="titled" title="Help & support" onBack={() => router.back()} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: 18,
          paddingHorizontal: 16,
          gap: 10,
        }}
      >
        <Eyebrow>Common questions</Eyebrow>

        {FAQS.map((faq, index) => {
          const isOpen = expanded === index;
          return (
            <Pressable
              key={faq.question}
              onPress={() => setExpanded(isOpen ? -1 : index)}
              style={{
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: '#E5E3DC',
                borderRadius: 12,
                padding: 13,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: isOpen ? 'flex-start' : 'center',
                  gap: 10,
                }}
              >
                <Text
                  style={{
                    fontFamily: 'PublicSans-600',
                    fontSize: 13,
                    lineHeight: 17.55,
                    color: '#17262D',
                    flex: 1,
                  }}
                >
                  {faq.question}
                </Text>
                <Text
                  style={{
                    fontSize: isOpen ? 13 : 15,
                    lineHeight: 17.55,
                    color: isOpen ? '#8A9499' : '#C7C3B9',
                  }}
                >
                  {isOpen ? '–' : '+'}
                </Text>
              </View>
              {isOpen && !!faq.answer && (
                <Text
                  style={{
                    fontFamily: 'PublicSans-400',
                    fontSize: 12.5,
                    lineHeight: 18.75,
                    color: '#5D6B70',
                    marginTop: 7,
                  }}
                >
                  {faq.answer}
                </Text>
              )}
            </Pressable>
          );
        })}

        {/* Contact card */}
        <Pressable
          onPress={() => WebBrowser.openBrowserAsync(`mailto:${SUPPORT_EMAIL}`)}
          style={{
            backgroundColor: '#22333F',
            borderRadius: 12,
            padding: 14,
            marginTop: 4,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <View>
            <Text style={{ fontFamily: 'PublicSans-600', fontSize: 13, color: '#FFFFFF' }}>
              Still need a hand?
            </Text>
            <Text
              style={{
                fontFamily: 'PublicSans-400',
                fontSize: 11.5,
                color: '#9FB2B8',
                marginTop: 2,
              }}
            >
              {SUPPORT_EMAIL}
            </Text>
          </View>
          <Text style={{ fontFamily: 'PublicSans-700', fontSize: 14, color: '#E4772A' }}>
            ↗
          </Text>
        </Pressable>

        <View style={{ marginTop: 'auto', marginBottom: 16 + insets.bottom }}>
          <ListCard
            variant="nav"
            labelSize={13}
            rows={[
              {
                label: 'Terms of use',
                accessory: 'chevron',
                onPress: () => router.push('/terms-of-use'),
              },
              {
                label: 'Privacy policy',
                accessory: 'chevron',
                onPress: () => router.push('/privacy-policy'),
              },
            ]}
          />
        </View>
      </ScrollView>
    </View>
  );
}
