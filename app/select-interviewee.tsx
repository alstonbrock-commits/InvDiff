import React, { useState } from 'react';
import { View, ScrollView, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ScreenHeader,
  Button,
  OfflineNote,
  DashedBorder,
  Eyebrow,
  Field,
  alertDialog,
  showDialog,
} from '@/components';
import { useAuth } from '@/lib/auth';
import { useFocusData, useKeyboardHeight } from '@/lib/hooks';
import {
  addInterviewee,
  displayRef,
  getEvent,
  listAnswersForInterviewee,
  listInterviewees,
  listQuestions,
  removeInterviewee,
  teamMemberName,
  updateInterviewee,
} from '@/lib/db/queries';
import { fetchEventTranscripts } from '@/lib/remote';
import { isOfflineError, startInsightGeneration } from '@/lib/insightFlow';
import { firstNames, initialsOf, joinNames, splitNames } from '@/lib/names';

export default function SelectInterviewee() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // A joint interview holds several people — one name field per person.
  const [newNames, setNewNames] = useState<string[]>(['']);
  const [newRole, setNewRole] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNames, setEditNames] = useState<string[]>(['']);
  const [editRole, setEditRole] = useState('');
  const [genBusy, setGenBusy] = useState(false);

  const { data, reload } = useFocusData(
    async () => {
      if (!eventId) return null;
      const [event, people, questions] = await Promise.all([
        getEvent(eventId),
        listInterviewees(eventId),
        listQuestions(eventId),
      ]);
      // Done state: every question answered → show DONE with last recording time.
      // Part-way people carry a count so the roster can say "3 of 7 recorded"
      // and offer to resume rather than looking untouched.
      const doneAt = new Map<string, string>();
      const recordedCount = new Map<string, number>();
      for (const person of people) {
        const answers = await listAnswersForInterviewee(person.id);
        const recorded = answers.filter((a) => a.recorded_at);
        recordedCount.set(person.id, recorded.length);
        if (questions.length > 0 && recorded.length >= questions.length) {
          const last = recorded
            .map((a) => a.recorded_at!)
            .sort()
            .at(-1)!;
          doneAt.set(
            person.id,
            new Date(last).toLocaleTimeString('en-AU', {
              hour: 'numeric',
              minute: '2-digit',
            }),
          );
        }
      }
      // A supervisor opening a team member's event: name the owner and put
      // the screen into read-only mode (every write below is hidden — RLS
      // would reject the push, and a rejected row stalls the whole outbox).
      const ownerName =
        event && userId && event.owner_id !== userId
          ? await teamMemberName(event.owner_id)
          : null;
      return { event, people, questions, doneAt, recordedCount, ownerName };
    },
    [eventId, userId],
  );

  const readOnly = !!data?.event && !!userId && data.event.owner_id !== userId;
  const ownerLabel = data?.ownerName ?? 'a team member';
  const anyRecorded = [...(data?.recordedCount.values() ?? [])].some((n) => n > 0);

  const people = data?.people ?? [];
  const questions = data?.questions ?? [];
  const selectable = people.filter((p) => !data?.doneAt.has(p.id));
  const effectiveSelected =
    selected && selectable.some((p) => p.id === selected)
      ? selected
      : selectable[0]?.id ?? null;
  const selectedPerson = people.find((p) => p.id === effectiveSelected) ?? null;

  const startEditPerson = (id: string, name: string, role: string | null) => {
    setEditingId(id);
    setEditNames(splitNames(name));
    setEditRole(role ?? '');
    setAdding(false);
  };

  const saveEdit = async (id: string) => {
    const name = joinNames(editNames);
    if (!name) return;
    await updateInterviewee(id, name, editRole.trim());
    setEditingId(null);
    reload();
  };

  const confirmRemove = (id: string, name: string, recorded: number) => {
    showDialog({
      variant: 'confirm',
      title: `Remove ${firstNames(name)}?`,
      body:
        recorded > 0
          ? `${recorded} recorded answer${recorded === 1 ? '' : 's'} and any transcripts will be removed from this event too.`
          : 'They will be taken off this event.',
      cancelLabel: 'Cancel',
      confirmLabel: 'Remove',
      onConfirm: () => {
        void (async () => {
          await removeInterviewee(id);
          setEditingId(null);
          setSelected(null);
          reload();
        })();
      },
    });
  };

  const addPerson = async () => {
    const name = joinNames(newNames);
    if (!name || !eventId) return;
    await addInterviewee(eventId, name, newRole.trim());
    setNewNames(['']);
    setNewRole('');
    setAdding(false);
    reload();
  };

  // Explicit, user-driven generation from the event hub — for when "more
  // interviews" was answered earlier (or by mistake) and the event is ready.
  const generateFromRoster = async () => {
    if (genBusy || !eventId) return;
    setGenBusy(true);
    try {
      const rows = await fetchEventTranscripts(eventId);
      const recordedTotal = [...(data?.recordedCount.values() ?? [])].reduce(
        (a, b) => a + b,
        0,
      );
      const approvedTotal = rows.filter((t) => t.status === 'approved').length;
      // Unreviewed answers must never reach the report — the synthesis reads
      // all transcript text regardless of status.
      if (recordedTotal === 0 || approvedTotal < recordedTotal) {
        alertDialog(
          'Approve the transcripts first',
          'Tap a person above to review and approve their interview, then generate the insight.',
        );
        return;
      }
      showDialog({
        variant: 'confirm',
        title: 'Generate the insight now?',
        body: 'This closes the event. You can still correct transcripts and regenerate afterwards.',
        cancelLabel: 'Not yet',
        confirmLabel: 'Generate insight',
        onConfirm: () => {
          void (async () => {
            setGenBusy(true);
            try {
              await startInsightGeneration(eventId);
              router.push('/(tabs)/(insights)');
            } catch (e) {
              alertDialog(
                isOfflineError(e) ? 'No connection' : 'Could not generate the insight',
                isOfflineError(e)
                  ? 'Generating the insight needs internet — reconnect and try again.'
                  : String(e),
              );
            } finally {
              setGenBusy(false);
            }
          })();
        },
      });
    } catch (e) {
      if (isOfflineError(e)) {
        alertDialog(
          'No connection',
          'Generating the insight needs internet — reconnect and try again.',
        );
      } else {
        alertDialog('Could not check the transcripts', String(e));
      }
    } finally {
      setGenBusy(false);
    }
  };

  const start = () => {
    if (!selectedPerson || !eventId) return;
    router.push({
      pathname: '/recorded-interview',
      params: { eventId, intervieweeId: selectedPerson.id },
    });
  };

  // Someone who has finished recording: open their transcripts to review,
  // correct or re-approve — including after the insight has been generated.
  const review = (intervieweeId: string) => {
    if (!eventId) return;
    router.push({
      pathname: '/approve-transcript',
      params: { eventId, intervieweeId },
    });
  };

  // Everyone recorded → the event's next step is reviewing transcripts, not
  // recording. Without this the screen dead-ends on a disabled button.
  const allRecorded = people.length > 0 && selectable.length === 0;

  const subtitle = data?.event
    ? `${displayRef(data.event.id)} · ${data.event.title}`.toUpperCase()
    : '';

  // The Insights tab lists insights, so a finalised event that produced none
  // (too little in the interviews to learn from) would be unreachable. The
  // roster is every event's hub, so the report is always one tap from here.
  const finalised = data?.event?.status === 'finalised';

  return (
    <View style={{ flex: 1, backgroundColor: '#F6F5F1' }}>
      <ScreenHeader
        variant="titled"
        title={readOnly ? `${ownerLabel}'s interviews` : 'Who are you interviewing?'}
        subtitle={subtitle}
        onBack={() => router.back()}
      />

      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: 18,
          paddingHorizontal: 16,
          paddingBottom: keyboardHeight,
          gap: 10,
        }}
      >
        <Eyebrow>Interviewees on this event</Eyebrow>

        {people.map((person) => {
          const done = data?.doneAt.get(person.id);
          const partOf = data?.recordedCount.get(person.id) ?? 0;
          const isSelected = !readOnly && !done && person.id === effectiveSelected;

          // Correcting a name, or taking someone off the event who was never
          // interviewed — without this the roster gate below has no escape.
          if (editingId === person.id) {
            return (
              <View
                key={person.id}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 12,
                  borderWidth: 1.5,
                  borderColor: '#E4772A',
                  padding: 13,
                  gap: 10,
                }}
              >
                {editNames.map((n, i) => (
                  <Field
                    key={i}
                    label={i === 0 ? 'Name' : `Person ${i + 1} name`}
                    value={n}
                    onChangeText={(t) =>
                      setEditNames((ns) => ns.map((x, j) => (j === i ? t : x)))
                    }
                    autoCapitalize="words"
                    autoCorrect={false}
                  />
                ))}
                <Pressable onPress={() => setEditNames((ns) => [...ns, ''])} hitSlop={6}>
                  <Text style={{ fontFamily: 'PublicSans-600', fontSize: 12, color: '#2CA5C0' }}>
                    + Add another person to this interview
                  </Text>
                </Pressable>
                <Field
                  label="Role or segment"
                  value={editRole}
                  onChangeText={setEditRole}
                  placeholder="Witness · pedestrian on walkway"
                />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      variant="secondary"
                      size="sm"
                      fullWidth
                      onPress={() => setEditingId(null)}
                    >
                      Cancel
                    </Button>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      variant="primary"
                      size="sm"
                      fullWidth
                      disabled={!joinNames(editNames)}
                      onPress={() => void saveEdit(person.id)}
                    >
                      Save
                    </Button>
                  </View>
                </View>
                <Button
                  variant="danger-ghost"
                  size="sm"
                  fullWidth
                  onPress={() => confirmRemove(person.id, person.name, partOf)}
                >
                  Remove from event
                </Button>
              </View>
            );
          }

          return (
            <Pressable
              key={person.id}
              // Not yet recorded → select them. Finished → open their
              // transcripts for review/correction (works post-insight too).
              onPress={() =>
                readOnly
                  ? partOf > 0 && review(person.id)
                  : done
                    ? review(person.id)
                    : setSelected(person.id)
              }
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 12,
                borderWidth: isSelected ? 1.5 : 1,
                borderColor: isSelected ? '#E4772A' : '#E5E3DC',
                padding: 13,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: done ? '#EFEDE7' : '#E7EEF0',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    fontFamily: 'Archivo-800',
                    fontSize: 12,
                    color: done ? '#8A9499' : '#2CA5C0',
                  }}
                >
                  {initialsOf(person.name)}
                </Text>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: 'PublicSans-600', fontSize: 14, color: '#17262D' }}>
                  {person.name}
                </Text>
                {!!person.role_or_segment && (
                  <Text
                    style={{
                      fontFamily: 'PublicSans-400',
                      fontSize: 11.5,
                      color: '#5D6B70',
                      marginTop: 2,
                    }}
                  >
                    {person.role_or_segment}
                  </Text>
                )}
                {/* Part-way through: say so, or an interrupted interview looks
                    identical to one that never started. */}
                {!done && partOf > 0 && (
                  <Text
                    style={{
                      fontFamily: 'IBMPlexMono-400',
                      fontSize: 10,
                      color: '#E4772A',
                      marginTop: 3,
                    }}
                  >
                    {`${partOf} OF ${questions.length} RECORDED`}
                  </Text>
                )}
              </View>

              {/* Hit area kept generous — it sits next to the row's own tap. */}
              {!readOnly && (
                <Pressable
                  onPress={() => startEditPerson(person.id, person.name, person.role_or_segment)}
                  hitSlop={8}
                  style={{ paddingHorizontal: 8, paddingVertical: 6 }}
                >
                  <Text
                    style={{
                      fontFamily: 'PublicSans-600',
                      fontSize: 11.5,
                      color: '#2CA5C0',
                    }}
                  >
                    Edit
                  </Text>
                </Pressable>
              )}

              {done || (readOnly && partOf > 0) ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                  <View
                    style={{
                      backgroundColor: 'rgba(44,165,192,0.14)',
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 20,
                    }}
                  >
                    <Text style={{ fontFamily: 'Archivo-700', fontSize: 9.5, color: '#2CA5C0' }}>
                      {done ? `DONE ${done}` : `${partOf} OF ${questions.length}`}
                    </Text>
                  </View>
                  <Text style={{ fontFamily: 'PublicSans-600', fontSize: 16, color: '#8A9499' }}>
                    ›
                  </Text>
                </View>
              ) : readOnly ? null : (
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isSelected ? '#E4772A' : 'transparent',
                    borderWidth: isSelected ? 0 : 1.5,
                    borderColor: '#D8DDDE',
                  }}
                >
                  {isSelected && (
                    <Text style={{ fontFamily: 'Archivo-700', fontSize: 11, color: '#FFFFFF' }}>
                      ✓
                    </Text>
                  )}
                </View>
              )}
            </Pressable>
          );
        })}

        {readOnly ? null : adding ? (
          <View style={{ gap: 10 }}>
            {newNames.map((n, i) => (
              <Field
                key={i}
                label={i === 0 ? 'Name' : `Person ${i + 1} name`}
                value={n}
                onChangeText={(t) =>
                  setNewNames((ns) => ns.map((x, j) => (j === i ? t : x)))
                }
                placeholder="K. Rao"
                autoCapitalize="words"
                autoCorrect={false}
              />
            ))}
            <Pressable onPress={() => setNewNames((ns) => [...ns, ''])} hitSlop={6}>
              <Text style={{ fontFamily: 'PublicSans-600', fontSize: 12, color: '#2CA5C0' }}>
                + Add another person to this interview
              </Text>
            </Pressable>
            <Field
              label="Role or segment"
              value={newRole}
              onChangeText={setNewRole}
              placeholder="Witness · pedestrian on walkway"
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button variant="secondary" size="sm" fullWidth onPress={() => setAdding(false)}>
                  Cancel
                </Button>
              </View>
              <View style={{ flex: 1 }}>
                <Button variant="primary" size="sm" fullWidth onPress={() => void addPerson()}>
                  Add
                </Button>
              </View>
            </View>
          </View>
        ) : (
          <Pressable onPress={() => setAdding(true)}>
            <DashedBorder radius={12}>
              <View
                style={{
                  padding: 13,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <Text style={{ fontSize: 15, lineHeight: 15, color: '#8A9499' }}>+</Text>
                <Text style={{ fontFamily: 'PublicSans-600', fontSize: 13, color: '#5D6B70' }}>
                  Add someone else
                </Text>
              </View>
            </DashedBorder>
          </Pressable>
        )}

        {/* Question set — informational; questions are fixed per event */}
        <View style={{ marginTop: 4 }}>
          <Eyebrow style={{ marginBottom: 8 }}>Question set</Eyebrow>
          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderWidth: 1,
              borderColor: '#E5E3DC',
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                padding: 13,
                borderBottomWidth: 1,
                borderBottomColor: '#EFEDE7',
              }}
            >
              <Text style={{ fontFamily: 'PublicSans-600', fontSize: 13.5, color: '#17262D' }}>
                Standard set
              </Text>
              <Text
                style={{
                  fontFamily: 'PublicSans-400',
                  fontSize: 11.5,
                  color: '#5D6B70',
                  marginTop: 2,
                }}
              >
                {questions.length} questions
              </Text>
            </View>

            {questions.map((question, index) => (
              <View
                key={question.id}
                style={{
                  flexDirection: 'row',
                  gap: 9,
                  paddingHorizontal: 13,
                  paddingVertical: 9,
                  alignItems: 'baseline',
                  borderBottomWidth: index < questions.length - 1 ? 1 : 0,
                  borderBottomColor: '#EFEDE7',
                }}
              >
                <Text style={{ fontFamily: 'IBMPlexMono-400', fontSize: 10, color: '#2CA5C0' }}>
                  {String(question.position).padStart(2, '0')}
                </Text>
                <Text
                  style={{
                    fontFamily: 'PublicSans-400',
                    fontSize: 12,
                    color: '#3A474D',
                    lineHeight: 16.2,
                    flex: 1,
                  }}
                >
                  {question.text}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Supervisor view of a team member's event: look, don't touch. */}
      {readOnly && keyboardHeight === 0 && (
        <View style={{ paddingTop: 14, paddingHorizontal: 18, paddingBottom: 22 + insets.bottom }}>
          <View style={{ marginBottom: 10 }}>
            <OfflineNote>
              {`Read-only — this event belongs to ${ownerLabel}. Tap a person to read their transcripts.`}
            </OfflineNote>
          </View>
          {finalised ? (
            <Button
              variant="primary"
              fullWidth
              onPress={() => router.push({ pathname: '/insight-detail', params: { eventId } })}
            >
              View insight
            </Button>
          ) : (
            <Button
              variant="secondary"
              fullWidth
              disabled={!anyRecorded}
              onPress={() => {
                const first = people.find((p) => (data?.recordedCount.get(p.id) ?? 0) > 0);
                if (first) review(first.id);
              }}
            >
              {anyRecorded ? 'View transcripts' : 'No interviews recorded yet'}
            </Button>
          )}
        </View>
      )}

      {/* Hidden while typing so the footer never covers the add-person fields. */}
      {!readOnly && keyboardHeight === 0 && (
        <View style={{ paddingTop: 14, paddingHorizontal: 18, paddingBottom: 22 + insets.bottom }}>
          <View style={{ marginBottom: 10 }}>
            <OfflineNote>
              {allRecorded
                ? 'Tap anyone above to review or correct their transcript'
                : 'Recording starts as soon as you tap through'}
            </OfflineNote>
          </View>
          {finalised && (
            <View style={{ marginBottom: 10 }}>
              <Button
                variant="secondary"
                fullWidth
                onPress={() =>
                  router.push({ pathname: '/insight-detail', params: { eventId } })
                }
              >
                View insight
              </Button>
            </View>
          )}
          {!finalised && allRecorded && (
            <View style={{ marginBottom: 10 }}>
              <Button
                variant="secondary"
                fullWidth
                disabled={genBusy}
                onPress={() => void generateFromRoster()}
              >
                {genBusy ? 'Checking…' : 'Generate insight'}
              </Button>
            </View>
          )}
          <Button
            variant="primary"
            fullWidth
            disabled={!selectedPerson && !allRecorded}
            onPress={() => (allRecorded ? review(people[0].id) : start())}
          >
            {selectedPerson
              ? `${
                  (data?.recordedCount.get(selectedPerson.id) ?? 0) > 0 ? 'Resume' : 'Start'
                } interview with ${firstNames(selectedPerson.name)}`
              : allRecorded
                ? 'Review transcripts'
                : 'Add an interviewee to start'}
          </Button>
        </View>
      )}
    </View>
  );
}
