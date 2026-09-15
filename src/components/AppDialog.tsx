import React, { useEffect, useState } from 'react';
import { Modal, View, Text } from 'react-native';
import Button from './Button';
import Eyebrow from './Eyebrow';

// Themed replacement for Alert.alert: same imperative ergonomics, brand look.
// Mount <DialogHost /> once at the root; call showDialog/alertDialog anywhere.

export interface DialogOptions {
  variant?: 'success' | 'error' | 'confirm';
  eyebrow?: string;
  title: string;
  body?: string;
  confirmLabel?: string; // defaults to 'OK'
  cancelLabel?: string; // when set, renders a two-button confirm layout
  onConfirm?: () => void;
  onCancel?: () => void;
}

let present: ((opts: DialogOptions) => void) | null = null;

export function showDialog(opts: DialogOptions): void {
  present?.(opts);
}

/** Drop-in for Alert.alert(title, message) — themed, single OK button. */
export function alertDialog(title: string, body?: string): void {
  showDialog({ variant: 'error', title, body });
}

const ICON: Record<NonNullable<DialogOptions['variant']>, string> = {
  success: '✓',
  error: '!',
  confirm: '?',
};

export function DialogHost() {
  const [opts, setOpts] = useState<DialogOptions | null>(null);

  useEffect(() => {
    present = setOpts;
    return () => {
      present = null;
    };
  }, []);

  if (!opts) return null;
  const variant = opts.variant ?? 'error';

  const close = () => setOpts(null);
  const confirm = () => {
    close();
    opts.onConfirm?.();
  };
  const cancel = () => {
    close();
    opts.onCancel?.();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={cancel}>
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
            <Text style={{ fontFamily: 'Archivo-800', fontSize: 18, color: '#E4772A' }}>
              {ICON[variant]}
            </Text>
          </View>

          {opts.eyebrow ? <Eyebrow style={{ marginBottom: 6 }}>{opts.eyebrow}</Eyebrow> : null}

          <Text
            style={{
              fontFamily: 'Archivo-800',
              fontSize: 20,
              lineHeight: 24,
              letterSpacing: -0.4,
              color: '#17262D',
            }}
          >
            {opts.title}
          </Text>

          {opts.body ? (
            <Text
              style={{
                fontFamily: 'PublicSans-400',
                fontSize: 13,
                lineHeight: 19.5,
                color: '#5D6B70',
                marginTop: 8,
              }}
            >
              {opts.body}
            </Text>
          ) : null}

          {opts.cancelLabel ? (
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 18, alignSelf: 'stretch' }}>
              <View style={{ flex: 1 }}>
                <Button variant="secondary" fullWidth onPress={cancel}>
                  {opts.cancelLabel}
                </Button>
              </View>
              <View style={{ flex: 1.4 }}>
                <Button variant="primary" fullWidth onPress={confirm}>
                  {opts.confirmLabel ?? 'OK'}
                </Button>
              </View>
            </View>
          ) : (
            <View style={{ marginTop: 18, alignSelf: 'stretch' }}>
              <Button variant="primary" fullWidth onPress={confirm}>
                {opts.confirmLabel ?? 'OK'}
              </Button>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
