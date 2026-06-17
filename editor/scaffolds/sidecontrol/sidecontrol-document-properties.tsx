import {
  SidebarMenuSectionContent,
  SidebarSection,
  SidebarSectionHeaderActions,
  SidebarSectionHeaderItem,
  SidebarSectionHeaderLabel,
} from "@/components/sidebar";
import {
  PropertyEnum,
  PropertyInput,
  PropertyLine,
  PropertyLineLabel,
  PropertySeparator,
  PropertyTextarea,
} from "./ui";
import { Button } from "@/components/ui-editor/button";
import { CubeIcon, GearIcon, PlusIcon, TrashIcon } from "@radix-ui/react-icons";
import { Checkbox } from "@/components/ui/checkbox";
import { UserDataControl } from "./controls/x-userdata";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  useCurrentEditor,
  useEditorState,
  useNodeMetadata,
} from "@/grida-canvas-react";
import grida from "@grida/schema";
import { RGBA32FColorControl } from "./controls/color";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import {
  RHEMA_BACKGROUND_VIDEO_KEY,
  type RhemaBackgroundVideo,
} from "@/grida-canvas-hosted/playground/rhema-contract";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCurrentSceneState } from "@/grida-canvas-react/provider";

function SceneBackgroundPropertyLine() {
  const editor = useCurrentEditor();
  const { id: scene_id, background_color } = useCurrentSceneState();

  return (
    <PropertyLine>
      <RGBA32FColorControl
        variant="with-opacity"
        value={background_color ? background_color : undefined}
        onValueChange={(color) => {
          editor.commands.changeSceneBackground(scene_id, color);
        }}
      />
    </PropertyLine>
  );
}

const PICK_MEDIA_REQUEST_TYPE = "bible-helper-pick-media";
const PICK_MEDIA_RESULT_TYPE = "bible-helper-pick-media-result";

/**
 * Resolve the Bible Helper opener origin the editor was launched with.
 * Mirrors the validation in scripts/build-static.mjs (only http/https,
 * normalised to .origin). Falls back to the iframe ancestor origin, then
 * "*" as a last resort so a picked clip can still be uploaded even when
 * the query param is absent — BH validates the message source on its end.
 */
function resolveParentOrigin(): string {
  if (typeof window === "undefined") return "*";
  try {
    const param = new URLSearchParams(window.location.search).get(
      "parentOrigin"
    );
    if (param && param.trim()) {
      const parsed = new URL(param.trim());
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.origin;
      }
    }
  } catch {
    // ignore malformed parentOrigin
  }
  const ancestor = window.location.ancestorOrigins?.[0];
  if (ancestor && ancestor.trim()) return ancestor;
  return "*";
}

/**
 * Background-video picker. Lets the operator choose a looping clip; the
 * bytes are shipped to Bible Helper over the postMessage bridge, which
 * stores them in IndexedDB and replies with a stable blobKey. The
 * resulting { blobKey, name, mimeType } reference is stamped on the
 * scene's userdata so it round-trips on reopen and lands in the runtime
 * payload via buildRhemaThemeRuntimeJson.
 */
function SceneBackgroundVideoPropertyLine() {
  const editor = useCurrentEditor();
  const { id: scene_id } = useCurrentSceneState();
  const userdata = useNodeMetadata(scene_id, "userdata") as
    | Record<string, unknown>
    | undefined;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const rawSelection = userdata?.[RHEMA_BACKGROUND_VIDEO_KEY];
  const selection: RhemaBackgroundVideo | null =
    rawSelection &&
    typeof rawSelection === "object" &&
    typeof (rawSelection as Record<string, unknown>).blobKey === "string"
      ? (rawSelection as RhemaBackgroundVideo)
      : null;

  const writeSelection = useCallback(
    (next: RhemaBackgroundVideo | null) => {
      const current = (editor.getUserData(scene_id) ?? {}) as Record<
        string,
        unknown
      >;
      if (next) {
        editor.setUserData(scene_id, {
          ...current,
          [RHEMA_BACKGROUND_VIDEO_KEY]: next,
        });
      } else {
        const { [RHEMA_BACKGROUND_VIDEO_KEY]: _removed, ...rest } = current;
        editor.setUserData(scene_id, rest);
      }
    },
    [editor, scene_id]
  );

  const onFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Reset the input so picking the same file again re-fires onChange.
      e.target.value = "";
      if (!file) return;

      const parentOrigin = resolveParentOrigin();
      const requestId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `bgvid-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      setUploading(true);
      let bytes: ArrayBuffer;
      try {
        bytes = await file.arrayBuffer();
      } catch (err) {
        setUploading(false);
        console.error("[bg-video] failed to read file", err);
        toast.error("Could not read the selected video.");
        return;
      }

      const onMessage = (ev: MessageEvent) => {
        const data = ev.data as
          | {
              type?: string;
              payload?: {
                requestId?: string;
                ok?: boolean;
                blobKey?: string;
                name?: string;
                mimeType?: string;
                error?: string;
              };
            }
          | undefined;
        if (
          !data ||
          data.type !== PICK_MEDIA_RESULT_TYPE ||
          data.payload?.requestId !== requestId
        ) {
          return;
        }
        window.removeEventListener("message", onMessage);
        clearTimeout(timeout);
        setUploading(false);
        const payload = data.payload;
        if (payload?.ok && typeof payload.blobKey === "string") {
          writeSelection({
            blobKey: payload.blobKey,
            name: payload.name ?? file.name,
            mimeType: payload.mimeType ?? (file.type || undefined),
          });
          toast.success("Background video added.");
        } else {
          toast.error(
            payload?.error
              ? `Upload failed: ${payload.error}`
              : "Upload failed."
          );
        }
      };

      // Guard against a silent bridge (BH not listening / older build).
      const timeout = setTimeout(() => {
        window.removeEventListener("message", onMessage);
        setUploading(false);
        toast.error("Upload timed out — no response from Bible Helper.");
      }, 60_000);

      window.addEventListener("message", onMessage);
      window.parent.postMessage(
        {
          type: PICK_MEDIA_REQUEST_TYPE,
          payload: {
            requestId,
            name: file.name,
            mimeType: file.type || "video/mp4",
            bytes,
          },
        },
        parentOrigin,
        [bytes]
      );
    },
    [writeSelection]
  );

  return (
    <PropertyLine className="items-center">
      <PropertyLineLabel>Video</PropertyLineLabel>
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <span
          className="text-[11px] text-muted-foreground truncate"
          title={selection?.name ?? "None"}
        >
          {uploading ? "Uploading…" : (selection?.name ?? "None")}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="xs"
            className="flex-1"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {selection ? "Replace video…" : "Choose video…"}
          </Button>
          {selection && !uploading && (
            <Button
              variant="ghost"
              size="xs"
              className="size-6 p-0"
              title="Remove background video"
              onClick={() => writeSelection(null)}
            >
              <TrashIcon />
            </Button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={onFileChange}
        />
      </div>
    </PropertyLine>
  );
}

export function DocumentProperties({ className }: { className?: string }) {
  const editor = useCurrentEditor();
  const properties = useEditorState(
    editor,
    (s) => s.document.properties,
    Object.is
  );

  const keys = Object.keys(properties ?? {});

  const addProperty = () => {
    editor.commands.schemaDefineProperty();
  };

  return (
    <div className={className}>
      <SidebarSection className="pb-2">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Scene</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent>
          <SceneBackgroundPropertyLine />
          <SceneBackgroundVideoPropertyLine />
        </SidebarMenuSectionContent>
      </SidebarSection>
      <hr />
      <SidebarSection className="pt-2 border-b">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Properties</SidebarSectionHeaderLabel>
          <SidebarSectionHeaderActions className="visible">
            <Button
              variant="ghost"
              size="xs"
              onClick={addProperty}
              className="size-4 p-0"
            >
              <PlusIcon />
            </Button>
          </SidebarSectionHeaderActions>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent className="divide-y m-0 p-0">
          {keys.map((key, i) => {
            const property = properties![key];
            return (
              <PropertyDefinitionBlock
                key={i}
                definition={property}
                name={key}
                onNameChange={(newName) => {
                  editor.commands.schemaRenameProperty(key, newName);
                }}
                onDefinitionChange={(value) => {
                  editor.commands.schemaUpdateProperty(key, value);
                }}
                onRemove={() => {
                  editor.commands.schemaDeleteProperty(key);
                }}
              />
            );
          })}
        </SidebarMenuSectionContent>
      </SidebarSection>
    </div>
  );
}

function PropertyDefinitionBlock({
  name,
  definition,
  onRemove,
  onDefinitionChange,
  onNameChange,
}: {
  name?: string;
  definition: grida.program.schema.PropertyDefinition;
  onDefinitionChange?: (value: grida.program.schema.PropertyDefinition) => void;
  onNameChange?: (value: string) => void;
  onRemove?: () => void;
}) {
  const { type, default: defaultValue } = definition;

  const setName = (value: string) => {
    onNameChange?.(value);
  };

  const onDefinitionLineChange = (key: string, value: string) => {
    onDefinitionChange?.({ ...definition, [key]: value });
  };

  // following json schema + userdata
  // - type: "string"
  // - name: string
  // - default: string
  // - required: boolean
  // - description: string
  // - format: string
  // - pattern: string
  // - minLength: number
  // - maxLength: number
  // [extra]
  // - placeholder: string
  // - userdata: object

  return (
    <Collapsible className="mt-2">
      <CollapsibleTrigger className="w-full">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>
            <span className="overflow-hidden text-ellipsis w-full">
              <CubeIcon className="me-1.5 inline align-middle" />
              {name ? name : "New Property"}
            </span>
            {type && (
              <>
                <br />
                <div className="text-xs text-workbench-accent-orange font-mono">
                  {type}
                </div>
              </>
            )}
          </SidebarSectionHeaderLabel>
          <SidebarSectionHeaderActions className="gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-4 p-0">
                  <GearIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <SidebarSection>
                  <SidebarSectionHeaderItem>
                    <SidebarSectionHeaderLabel>Extra</SidebarSectionHeaderLabel>
                  </SidebarSectionHeaderItem>
                  <SidebarMenuSectionContent className="space-y-2">
                    <PropertyLine>
                      {/* TODO: */}
                      <UserDataControl node_id="..." />
                    </PropertyLine>
                  </SidebarMenuSectionContent>
                </SidebarSection>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="icon"
              className="size-4 p-0"
              onClick={(e) => {
                e.stopPropagation();
                onRemove?.();
              }}
            >
              <TrashIcon />
            </Button>
          </SidebarSectionHeaderActions>
        </SidebarSectionHeaderItem>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2">
        <SidebarSection className="border-b pb-4 space-y-2">
          <PropertyLine>
            <PropertyLineLabel>Type *</PropertyLineLabel>
            <PropertyEnum
              value={type}
              onValueChange={(v) => {
                onDefinitionLineChange("type", v);
                onDefinitionChange?.({
                  ...definition,
                  type: v,
                  default: (initial_values as Record<string, unknown>)[v],
                } as grida.program.schema.PropertyDefinition);
              }}
              enum={["string", "number", "boolean", "image", "rgbaf"]}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Name *</PropertyLineLabel>
            <PropertyInput
              required
              autoFocus
              value={name}
              pattern="^[a-zA-Z_$][a-zA-Z0-9_$]*$"
              onChange={(e) => setName(e.target.value)}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Description</PropertyLineLabel>
            <PropertyInput />
          </PropertyLine>
          <PropertyLine className="flex items-center">
            <PropertyLineLabel>Required</PropertyLineLabel>
            <Checkbox defaultChecked />
          </PropertyLine>
          <PropertySeparator />
          <PropertyLine className="grid w-full">
            <PropertyLineLabel>Default</PropertyLineLabel>
            <div className="w-full">
              <PropertyDefinitionValueInput
                definition={definition}
                value={defaultValue}
                onValueChange={(value) => {
                  onDefinitionLineChange("default", value);
                }}
                placeholder="Enter Default Value"
              />
            </div>
          </PropertyLine>
        </SidebarSection>
        <SidebarSection
          hidden={type !== "string"}
          className="border-b pb-4 m-0"
        >
          <SidebarSectionHeaderItem>
            <SidebarSectionHeaderLabel>Length</SidebarSectionHeaderLabel>
          </SidebarSectionHeaderItem>
          <SidebarMenuSectionContent className="space-y-2">
            <PropertyLine>
              <PropertyLineLabel>Min Length</PropertyLineLabel>
              <PropertyInput type="number" min={0} placeholder="0" />
            </PropertyLine>
            <PropertyLine>
              <PropertyLineLabel>Max Length</PropertyLineLabel>
              <PropertyInput type="number" min={0} placeholder="♾️" />
            </PropertyLine>
          </SidebarMenuSectionContent>
        </SidebarSection>
        <SidebarSection
          hidden={type !== "number"}
          className="border-b pb-4 m-0"
        >
          <SidebarSectionHeaderItem>
            <SidebarSectionHeaderLabel>Range</SidebarSectionHeaderLabel>
          </SidebarSectionHeaderItem>
          <SidebarMenuSectionContent className="space-y-2">
            <PropertyLine>
              <PropertyLineLabel>Minimum</PropertyLineLabel>
              <PropertyInput type="number" placeholder="minimum" />
            </PropertyLine>
            <PropertyLine>
              <PropertyLineLabel>Maximum</PropertyLineLabel>
              <PropertyInput type="number" placeholder="maximum" />
            </PropertyLine>
          </SidebarMenuSectionContent>
        </SidebarSection>
      </CollapsibleContent>
    </Collapsible>
  );
}

const initial_values = {
  string: "" satisfies string,
  number: 0 satisfies number,
  boolean: false satisfies boolean,
  rgba: {
    type: "rgbaf",
    r: 0,
    g: 0,
    b: 0,
    a: 1,
  } satisfies grida.program.objects.RGBA32F,
  object: {
    type: "object",
    properties: {},
  },
} as const;

function PropertyDefinitionValueInput<T = unknown>({
  definition,
  value,
  onValueChange,
  placeholder,
}: {
  definition: grida.program.schema.PropertyDefinition;
  value: T;
  onValueChange: (value: T) => void;
  placeholder?: string;
}) {
  switch (definition.type) {
    case "string":
      return (
        <PropertyTextarea
          value={value as string}
          onChange={(e) => {
            onValueChange(e.target.value as T);
          }}
          placeholder={placeholder}
        />
      );
    case "number":
      return (
        <PropertyInput
          type="number"
          value={value as number}
          onChange={(e) => onValueChange(e.target.value as unknown as T)}
          placeholder={placeholder}
        />
      );
    case "boolean":
      return (
        <PropertyEnum<"true" | "false">
          value={(value as boolean).toString() as "true" | "false"}
          placeholder={placeholder}
          onValueChange={(v) => {
            if (v === "true") onValueChange(true as unknown as T);
            else onValueChange(false as unknown as T);
          }}
          enum={[
            {
              label: "true",
              value: "true",
            },
            {
              label: "false",
              value: "false",
            },
          ]}
        />
      );
    case "rgbaf":
      return (
        <RGBA32FColorControl
          // oxlint-disable-next-line typescript-eslint/no-explicit-any -- color value type cast
          value={value as unknown as any}
          onValueChange={(v) => onValueChange(v as unknown as T)}
        />
      );
    //
  }
}
