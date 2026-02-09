import { useState } from "react";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  useUnitGroups,
  useCreateUnitGroup,
  useUpdateUnitGroup,
  useDeleteUnitGroup,
  type UnitGroup,
} from "@/hooks/useUnitGroups";

export function UnitGroupManager() {
  const { data: groups } = useUnitGroups();
  const createGroup = useCreateUnitGroup();
  const updateGroup = useUpdateUnitGroup();
  const deleteGroup = useDeleteUnitGroup();
  const { toast } = useToast();

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await createGroup.mutateAsync({ name: newName.trim() });
      setNewName("");
      setAdding(false);
      toast({ title: "Group created" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) return;
    try {
      await updateGroup.mutateAsync({ id, name: editName.trim() });
      setEditingId(null);
      toast({ title: "Group updated" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async (group: UnitGroup) => {
    if (!confirm(`Delete group "${group.name}"? Units in this group will become ungrouped.`)) return;
    try {
      await deleteGroup.mutateAsync(group.id);
      toast({ title: "Group deleted" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {groups?.map((g) =>
          editingId === g.id ? (
            <div key={g.id} className="flex items-center gap-1">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-7 w-40 text-sm"
                onKeyDown={(e) => e.key === "Enter" && handleUpdate(g.id)}
                autoFocus
              />
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleUpdate(g.id)}>
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <Badge
              key={g.id}
              variant="secondary"
              className="cursor-pointer gap-1 pr-1 text-sm"
            >
              <span
                onClick={() => {
                  setEditingId(g.id);
                  setEditName(g.name);
                }}
                className="flex items-center gap-1"
              >
                {g.name}
                <Pencil className="h-3 w-3 opacity-50" />
              </span>
              <button
                onClick={() => handleDelete(g)}
                className="ml-1 rounded p-0.5 hover:bg-destructive/20"
              >
                <Trash2 className="h-3 w-3 text-destructive" />
              </button>
            </Badge>
          )
        )}

        {adding ? (
          <div className="flex items-center gap-1">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Group name"
              className="h-7 w-40 text-sm"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              autoFocus
            />
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleCreate}>
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setAdding(false); setNewName(""); }}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAdding(true)}>
            <Plus className="h-3 w-3 mr-1" /> New Group
          </Button>
        )}
      </div>
    </div>
  );
}
