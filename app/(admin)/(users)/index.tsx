import React, { useMemo, useState } from 'react';
import { View, ScrollView, Text, Pressable, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ScreenHeader, Eyebrow } from '@/components';
import { fetchAdminUserMetrics, type AdminUserMetric } from '@/lib/remote';

type RoleFilter = 'all' | 'facilitator' | 'admin';
type ActivityFilter = 'all' | 'active' | 'dormant';

const ROLE_LABEL: Record<string, string> = {
  facilitator: 'Facilitator',
  admin: 'Administrator',
};

function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function joined(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// Relative age reads faster than a date when scanning for who has gone quiet.
function lastActive(iso: string | null): string {
  if (!iso) return 'Never active';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'Active today';
  if (days === 1) return 'Active yesterday';
  if (days < 30) return `Active ${days} days ago`;
  const months = Math.floor(days / 30);
  return `Active ${months} month${months === 1 ? '' : 's'} ago`;
}

function isActive(u: AdminUserMetric): boolean {
  if (!u.last_active_at) return false;
  return Date.now() - new Date(u.last_active_at).getTime() < 30 * 86_400_000;
}

function Pills<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (id: T) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 7 }}>
      {options.map((o) => (
        <Pressable
          key={o.id}
          onPress={() => onChange(o.id)}
          style={{
            backgroundColor: value === o.id ? '#1B2B3A' : '#EFEDE7',
            paddingHorizontal: 11,
            paddingVertical: 6,
            borderRadius: 20,
          }}
        >
          <Text
            style={{
              fontFamily: 'PublicSans-700',
              fontSize: 11,
              color: value === o.id ? '#FFFFFF' : '#5D6B70',
            }}
          >
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function AdminUsers() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<RoleFilter>('all');
  const [activity, setActivity] = useState<ActivityFilter>('all');

  const users = useQuery({
    queryKey: ['admin-user-metrics'],
    queryFn: fetchAdminUserMetrics,
    retry: 1,
  });
  const all = useMemo(() => users.data ?? [], [users.data]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all
      .filter((u) => (role === 'all' ? true : u.role === role))
      .filter((u) =>
        activity === 'all' ? true : activity === 'active' ? isActive(u) : !isActive(u),
      )
      .filter(
        (u) =>
          !q ||
          [u.full_name ?? '', u.email, u.job_title ?? ''].join(' ').toLowerCase().includes(q),
      );
  }, [all, role, activity, search]);

  const subscribed = all.filter((u) => u.newsletter_opt_in).length;

  return (
    <View style={{ flex: 1, backgroundColor: '#F6F5F1' }}>
      <ScreenHeader
        variant="tab-title"
        title="Users"
        subtitle={`${all.length} account${all.length === 1 ? '' : 's'} · ${subscribed} subscribed`}
        searchPlaceholder="Search names, emails, job titles"
        searchValue={search}
        onSearchChange={setSearch}
      />

      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={users.isFetching && !users.isLoading}
            onRefresh={() => void users.refetch()}
            tintColor="#E4772A"
          />
        }
      >
        <View style={{ paddingTop: 14, paddingHorizontal: 16, gap: 8, paddingBottom: 12 }}>
          <Pills
            value={role}
            onChange={setRole}
            options={[
              { id: 'all', label: `All ${all.length}` },
              {
                id: 'facilitator',
                label: `Facilitators ${all.filter((u) => u.role === 'facilitator').length}`,
              },
              { id: 'admin', label: `Admins ${all.filter((u) => u.role === 'admin').length}` },
            ]}
          />
          <Pills
            value={activity}
            onChange={setActivity}
            options={[
              { id: 'all', label: 'Any activity' },
              { id: 'active', label: `Active 30d ${all.filter(isActive).length}` },
              { id: 'dormant', label: `Dormant ${all.filter((u) => !isActive(u)).length}` },
            ]}
          />
        </View>

        <View style={{ paddingHorizontal: 16, gap: 10 }}>
          {users.isLoading && (
            <Text
              style={{
                fontFamily: 'PublicSans-400',
                fontSize: 13,
                lineHeight: 19.5,
                color: '#5D6B70',
              }}
            >
              Loading accounts…
            </Text>
          )}

          {users.isError && (
            <Text
              style={{
                fontFamily: 'PublicSans-400',
                fontSize: 13,
                lineHeight: 19.5,
                color: '#5D6B70',
              }}
            >
              Accounts are online-only — reconnect to load them.
            </Text>
          )}

          {users.data && visible.length === 0 && (
            <Text
              style={{
                fontFamily: 'PublicSans-400',
                fontSize: 13,
                lineHeight: 19.5,
                color: '#5D6B70',
              }}
            >
              No accounts match those filters.
            </Text>
          )}

          {visible.length > 0 && <Eyebrow>Most recently active first</Eyebrow>}

          {visible.map((u) => {
            const name = u.full_name || u.email;
            return (
              <Pressable
                key={u.id}
                // Straight into everything this account has produced.
                onPress={() =>
                  router.push({
                    pathname: '/(admin)/(users)/[id]',
                    params: { id: u.id, name },
                  })
                }
                style={{
                  backgroundColor: '#FFFFFF',
                  borderWidth: 1,
                  borderColor: '#E5E3DC',
                  borderRadius: 12,
                  padding: 13,
                  gap: 10,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor:
                        u.role === 'admin' ? 'rgba(228,119,42,0.12)' : '#E7EEF0',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: 'Archivo-800',
                        fontSize: 12,
                        color: u.role === 'admin' ? '#E4772A' : '#2CA5C0',
                      }}
                    >
                      {initialsOf(name)}
                    </Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text
                      style={{ fontFamily: 'PublicSans-600', fontSize: 14, color: '#17262D' }}
                    >
                      {name}
                    </Text>
                    {/* Nameless accounts show the email as the title — don't repeat it. */}
                    {name !== u.email && (
                      <Text
                        style={{
                          fontFamily: 'PublicSans-400',
                          fontSize: 11.5,
                          color: '#5D6B70',
                          marginTop: 2,
                        }}
                      >
                        {u.email}
                      </Text>
                    )}
                    <Text
                      style={{
                        fontFamily: 'PublicSans-400',
                        fontSize: 11,
                        color: '#8A9499',
                        marginTop: 2,
                      }}
                    >
                      {u.job_title || ROLE_LABEL[u.role] || u.role} · joined {joined(u.created_at)}
                    </Text>
                  </View>

                  {u.newsletter_opt_in && (
                    <View
                      style={{
                        backgroundColor: 'rgba(44,165,192,0.14)',
                        paddingHorizontal: 7,
                        paddingVertical: 2,
                        borderRadius: 20,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: 'Archivo-700',
                          fontSize: 9,
                          letterSpacing: 0.5,
                          color: '#2CA5C0',
                        }}
                      >
                        SUBSCRIBED
                      </Text>
                    </View>
                  )}
                </View>

                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    borderTopWidth: 1,
                    borderTopColor: '#EFEDE7',
                    paddingTop: 9,
                  }}
                >
                  {(
                    [
                      ['Events', u.events_total],
                      ['Reports', u.reports_total],
                      ['Interviews', u.interviews_total],
                      ['Answers', u.answers_recorded],
                    ] as [string, number][]
                  ).map(([label, value]) => (
                    <View key={label} style={{ alignItems: 'center', flex: 1 }}>
                      <Text
                        style={{ fontFamily: 'Archivo-800', fontSize: 16, color: '#17262D' }}
                      >
                        {value}
                      </Text>
                      <Text
                        style={{
                          fontFamily: 'PublicSans-400',
                          fontSize: 10.5,
                          color: '#8A9499',
                          marginTop: 1,
                        }}
                      >
                        {label}
                      </Text>
                    </View>
                  ))}
                </View>

                <Text
                  style={{
                    fontFamily: 'IBMPlexMono-400',
                    fontSize: 9.5,
                    color: isActive(u) ? '#2CA5C0' : '#8A9499',
                    textTransform: 'uppercase',
                  }}
                >
                  {lastActive(u.last_active_at)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
