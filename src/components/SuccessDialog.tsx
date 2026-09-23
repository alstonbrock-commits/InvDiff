import React from 'react';
import { Modal, View, Text } from 'react-native';
import Button from './Button';
import Eyebrow from './Eyebrow';

interface SuccessDialogProps {
  visible: boolean;
  eyebrow?: string;
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
}

// Branded replacement for the stock Alert on success moments: paper card on
// the same scrim the bottom sheets use, orange tick, single primary action.
export default function SuccessDialog({
  visible,
  eyebrow,
  title,
  body,
  actionLabel,
  onAction,
}: SuccessDialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onAction}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(15,30,36,0.8)',
          justifyContent: 'center',
          paddingHorizontal: 28,
        }}
      >
        <View
          style={{
            backgroundColor: '#F6F5F1',
            borderRadius: 18,
            padding: 22,
            alignItems: 'flex-start',
          }}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: 'rgba(228,119,42,0.14)',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 14,
            }}
          >
            <Text style={{ fontFamily: 'Archivo-800', fontSize: 18, color: '#E4772A' }}>✓</Text>
          </View>

          {eyebrow ? <Eyebrow style={{ marginBottom: 6 }}>{eyebrow}</Eyebrow> : null}

          <Text
            style={{
              fontFamily: 'Archivo-800',
              fontSize: 20,
              lineHeight: 24,
              letterSpacing: -0.4,
              color: '#17262D',
            }}
          >
            {title}
          </Text>

          <Text
            style={{
              fontFamily: 'PublicSans-400',
              fontSize: 13,
              lineHeight: 19.5,
              color: '#5D6B70',
              marginTop: 8,
              marginBottom: 18,
            }}
          >
            {body}
          </Text>

          <Button variant="primary" fullWidth onPress={onAction}>
            {actionLabel}
          </Button>
        </View>
      </View>
    </Modal>
  );
}
