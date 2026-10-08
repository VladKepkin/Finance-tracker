"use client";

import { useEffect, useState, useCallback } from "react";
import { Users, Copy, Check, Plus, ShieldCheck, CreditCard, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import type { MonoAccount } from "@/lib/monobank";
import { formatMoney } from "@/lib/format";

interface Member {
  userId: number;
  username: string;
  role: "owner" | "member";
  joinedAt: number;
}

interface SharedAccount {
  accountId: string;
  ownerUserId: number;
  createdAt: number;
}

interface GroupDetail {
  id: number;
  name: string;
  role: "owner" | "member";
  memberCount: number;
  members: Member[];
  sharedAccounts: SharedAccount[];
}

export function FamilySettings({
  accounts,
  onRefresh,
}: {
  accounts: MonoAccount[];
  onRefresh?: () => void;
}) {
  const [groups, setGroups] = useState<GroupDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [newGroupName, setNewGroupName] = useState("");
  const [inviteCodeInput, setInviteCodeInput] = useState("");
  const [generatedInvite, setGeneratedInvite] = useState<{ groupId: number; code: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadGroups = useCallback(async () => {
    try {
      const res = await fetch("/api/groups");
      if (res.ok) {
        const data = await res.json();
        setGroups(data.groups || []);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newGroupName.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Не вдалося створити групу");
      }
      setNewGroupName("");
      await loadGroups();
      onRefresh?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateInvite = async (groupId: number) => {
    setError(null);
    try {
      const res = await fetch("/api/groups/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Не вдалося згенерувати запрошення");
      }
      const d = await res.json();
      setGeneratedInvite({ groupId, code: d.code });
      setCopied(false);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleAcceptInvite = async () => {
    if (!inviteCodeInput.trim()) return;
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/groups/invite", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: inviteCodeInput.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Не вдалося приєднатися");
      }
      setInviteCodeInput("");
      await loadGroups();
      onRefresh?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleShare = async (accountId: string, groupId: number, currentShared: boolean) => {
    setError(null);
    try {
      if (currentShared) {
        await fetch(`/api/groups/accounts?accountId=${accountId}&groupId=${groupId}`, {
          method: "DELETE",
        });
      } else {
        await fetch("/api/groups/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId, groupId }),
        });
      }
      await loadGroups();
      onRefresh?.();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          Завантаження налаштувань сім&apos;ї…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="size-5 text-primary" /> Спільний бюджет &amp; Сім&apos;я
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Можливість вести сімейний бюджет удвох: діліться вибраними картками Monobank, зберігаючи особисті рахунки у повній приватності.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && <p className="text-xs text-destructive">{error}</p>}

        {groups.length === 0 ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-dashed p-4 text-center space-y-2">
              <p className="text-sm font-medium">У тебе ще немає сімейної групи</p>
              <p className="text-xs text-muted-foreground">
                Створи групу «Сім&apos;я» і надішли код запрошення своїй дівчині/партнеру.
              </p>
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="Назва групи (напр. Сім'я)"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                className="h-10 text-sm"
              />
              <Button onClick={handleCreateGroup} disabled={actionLoading || !newGroupName.trim()}>
                <Plus className="size-4" /> Створити
              </Button>
            </div>

            <div className="pt-2 border-t space-y-2">
              <p className="text-xs text-muted-foreground">Або приєднайся за кодом запрошення:</p>
              <div className="flex gap-2">
                <Input
                  placeholder="КОД ЗАПРОШЕННЯ"
                  value={inviteCodeInput}
                  onChange={(e) => setInviteCodeInput(e.target.value)}
                  className="h-10 text-sm uppercase font-mono"
                />
                <Button variant="secondary" onClick={handleAcceptInvite} disabled={actionLoading || !inviteCodeInput.trim()}>
                  Приєднатися
                </Button>
              </div>
            </div>
          </div>
        ) : (
          groups.map((group) => {
            const sharedAccountIds = new Set(group.sharedAccounts.map((s) => s.accountId));

            return (
              <div key={group.id} className="space-y-4 rounded-2xl border bg-card/50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold">{group.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      Учасників: {group.members.length} • Твоя роль: {group.role === "owner" ? "Власник" : "Учасник"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleCreateInvite(group.id)}
                  >
                    Запросити
                  </Button>
                </div>

                {generatedInvite?.groupId === group.id && (
                  <div className="flex items-center justify-between rounded-xl bg-muted p-2.5 text-xs font-mono">
                    <div>
                      <span className="text-muted-foreground">Код запрошення: </span>
                      <strong className="text-foreground">{generatedInvite.code}</strong>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={() => copyCode(generatedInvite.code)}
                    >
                      {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
                    </Button>
                  </div>
                )}

                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Учасники групи:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {group.members.map((m) => (
                      <Badge key={m.userId} variant={m.role === "owner" ? "default" : "secondary"}>
                        {m.username} {m.role === "owner" && "★"}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t">
                  <div className="flex items-center gap-2">
                    <CreditCard className="size-4 text-primary" />
                    <span className="text-xs font-medium">Спільні картки для сімейного бюджету:</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Картки, увімкнені тут, стануть спільними для цієї групи. Обидва учасники бачитимуть їх баланс і операції.
                  </p>

                  <div className="divide-y rounded-xl border bg-background">
                    {accounts.length === 0 ? (
                      <div className="p-3 text-xs text-muted-foreground text-center">
                        Немає підключених карток Monobank
                      </div>
                    ) : (
                      accounts.map((acc) => {
                        const isShared = sharedAccountIds.has(acc.id);
                        return (
                          <div key={acc.id} className="flex items-center justify-between p-3">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-medium">
                                  {acc.type === "black" ? "Чорна картка" : acc.type === "white" ? "Біла картка" : "Картка"}
                                </span>
                                {acc.maskedPan?.[0] && (
                                  <span className="text-[10px] text-muted-foreground font-mono">
                                    {acc.maskedPan[0]}
                                  </span>
                                )}
                                {acc.isShared && (
                                  <Badge variant="outline" className="text-[10px] py-0">Спільна</Badge>
                                )}
                              </div>
                              <p className="text-xs font-semibold text-foreground">
                                {formatMoney(acc.balance, acc.currencyCode)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">
                                {isShared ? "Спільна" : "Приватна"}
                              </span>
                              <Switch
                                checked={isShared}
                                onCheckedChange={() => handleToggleShare(acc.id, group.id, isShared)}
                              />
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-xl bg-secondary/50 p-2.5 text-[11px] text-muted-foreground">
                  <ShieldCheck className="size-4 shrink-0 text-success" />
                  <span>
                    Ваші приватні картки повністю приховані. Партнер бачить виключно ті картки, для яких увімкнено спільний доступ.
                  </span>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
