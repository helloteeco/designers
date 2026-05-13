import type { Project } from "@/lib/types";
import { getTotalSleeping } from "@/lib/sleep-optimizer";

export interface ReadinessItem {
  id: string;
  label: string;
  detail: string;
  complete: boolean;
  requiredFor: "intake" | "scale" | "design" | "export";
}

export interface DesignReadiness {
  sourceItems: ReadinessItem[];
  workflowItems: ReadinessItem[];
  blockers: string[];
  assumptions: string[];
  canStartRoomDesign: boolean;
  canExportScoutScope: boolean;
  floorPlanGateOpen: boolean;
  furnitureScopeReady: boolean;
}

export function getDesignReadiness(project: Project): DesignReadiness {
  const floorPlans = project.property.floorPlans ?? [];
  const layoutCanvases = project.layoutCanvases ?? [];
  const calibratedCanvases = layoutCanvases.filter(canvas => !!canvas.calibration);
  const placedShapes = layoutCanvases.reduce((sum, canvas) => sum + (canvas.shapes?.length ?? 0), 0);
  const roomsWithDimensions = project.rooms.filter(room => room.widthFt > 0 && room.lengthFt > 0);
  const roomsWithFurniture = project.rooms.filter(room => (room.furniture ?? []).length > 0);
  const roomsWithReference = project.rooms.filter(room => !!(room.referenceImageUrl || room.sceneBackgroundUrl || room.originalRenderUrl));
  const hasScan = !!(project.property.matterportLink || project.property.polycamLink || project.property.matterportModelId);
  const hasFloorPlan = floorPlans.length > 0;
  const hasRooms = project.rooms.length > 0;
  const hasMeasuredRooms = hasRooms && roomsWithDimensions.length === project.rooms.length;
  const hasCalibratedScale = calibratedCanvases.length > 0;
  const hasPlacedFurnitureToScale = hasCalibratedScale && placedShapes > 0;
  const hasDesignConcept = project.moodBoards.some(board => board.isLockedConcept) || roomsWithReference.length > 0;
  const hasShoppingList = roomsWithFurniture.length > 0;
  const hasBudget = project.budget > 0;

  const sourceItems: ReadinessItem[] = [
    {
      id: "scan",
      label: "Matterport / Polycam source",
      detail: hasScan ? "Scan link/model is attached." : "Add Matterport, Polycam, or model ID before trusting room design.",
      complete: hasScan,
      requiredFor: "intake",
    },
    {
      id: "floor-plan",
      label: "Floor plan evidence",
      detail: hasFloorPlan ? `${floorPlans.length} floor plan source${floorPlans.length === 1 ? "" : "s"} attached.` : "Upload schematic floor plan, preferably Matterport SVG.",
      complete: hasFloorPlan,
      requiredFor: "scale",
    },
    {
      id: "room-inventory",
      label: "Room inventory",
      detail: hasRooms ? `${project.rooms.length} room${project.rooms.length === 1 ? "" : "s"} created.` : "Create rooms from floor plan before concepts or furniture scope.",
      complete: hasRooms,
      requiredFor: "scale",
    },
    {
      id: "measurements",
      label: "Measurements",
      detail: hasMeasuredRooms ? "Every room has width and length." : `${Math.max(project.rooms.length - roomsWithDimensions.length, 0)} room${project.rooms.length - roomsWithDimensions.length === 1 ? "" : "s"} missing dimensions.`,
      complete: hasMeasuredRooms,
      requiredFor: "scale",
    },
    {
      id: "budget",
      label: "Design budget",
      detail: hasBudget ? `$${project.budget.toLocaleString()} budget captured.` : "Budget missing. Export can run, but Count cannot judge realism.",
      complete: hasBudget,
      requiredFor: "export",
    },
  ];

  const workflowItems: ReadinessItem[] = [
    {
      id: "calibrated-layout",
      label: "Scale calibrated on floor plan",
      detail: hasCalibratedScale ? `${calibratedCanvases.length} calibrated layout canvas${calibratedCanvases.length === 1 ? "" : "es"}.` : "Use Design → Layout to mark a known wall and set real length.",
      complete: hasCalibratedScale,
      requiredFor: "design",
    },
    {
      id: "placed-items",
      label: "Furniture placed to scale",
      detail: hasPlacedFurnitureToScale ? `${placedShapes} layout shape${placedShapes === 1 ? "" : "s"} placed.` : "Do not build shopping list from vibes. Place items to scale first.",
      complete: hasPlacedFurnitureToScale,
      requiredFor: "design",
    },
    {
      id: "render-concept",
      label: "Room concept / render reference",
      detail: hasDesignConcept ? "At least one locked concept, room reference, or render exists." : "V1 tracks this as a blocker. AI renders stay manual/future until scale is real.",
      complete: hasDesignConcept,
      requiredFor: "design",
    },
    {
      id: "furniture-scope",
      label: "Furniture scope extracted",
      detail: hasShoppingList ? `${roomsWithFurniture.length} room${roomsWithFurniture.length === 1 ? "" : "s"} have furniture rows.` : "Add or source furniture rows after scale/concept review.",
      complete: hasShoppingList,
      requiredFor: "export",
    },
  ];

  const blockers: string[] = [];
  if (!hasScan) blockers.push("Missing Matterport/Polycam evidence source.");
  if (!hasFloorPlan) blockers.push("Missing floor plan upload/export.");
  if (!hasRooms) blockers.push("No room inventory created yet.");
  if (hasRooms && !hasMeasuredRooms) blockers.push("One or more rooms lack width/length measurements.");
  if (!hasCalibratedScale) blockers.push("Floor-plan scale is not calibrated, so furniture placement is not reliable.");
  if (!hasPlacedFurnitureToScale) blockers.push("Furniture is not placed to scale on the floor plan.");
  if (!hasDesignConcept) blockers.push("Room AI render/concept reference is not selected yet.");
  if (!hasShoppingList) blockers.push("Furniture scope/shopping list is not ready yet.");

  const assumptions: string[] = [];
  if (!hasScan && hasFloorPlan) assumptions.push("Floor plan is being treated as the source of truth until scan link is added.");
  if (!hasBudget) assumptions.push("Budget is unknown. Cost readiness cannot be judged.");
  if (hasRooms && !hasMeasuredRooms) assumptions.push("Room dimensions may be placeholder values from manual entry or SVG parsing.");
  if (project.targetGuests > getTotalSleeping(project.rooms)) assumptions.push("Sleep strategy may be under target until bed configurations are confirmed.");

  const floorPlanGateOpen = hasFloorPlan && hasRooms && hasMeasuredRooms && hasCalibratedScale;
  const canStartRoomDesign = floorPlanGateOpen && hasPlacedFurnitureToScale;
  const furnitureScopeReady = canStartRoomDesign && hasDesignConcept && hasShoppingList;
  const canExportScoutScope = hasFloorPlan && hasRooms;

  return {
    sourceItems,
    workflowItems,
    blockers,
    assumptions,
    canStartRoomDesign,
    canExportScoutScope,
    floorPlanGateOpen,
    furnitureScopeReady,
  };
}

export function buildScoutMarkdownScope(project: Project): string {
  const readiness = getDesignReadiness(project);
  const sleeping = getTotalSleeping(project.rooms);
  const furnitureTotal = project.rooms.reduce(
    (sum, room) => sum + room.furniture.reduce((roomSum, row) => roomSum + row.item.price * row.quantity, 0),
    0
  );

  const lines: string[] = [];
  lines.push(`# ${project.name || "Untitled STR Design Scope"}`);
  lines.push("");
  lines.push("## Project Intake");
  lines.push(`- Client: ${project.client.name || "Missing"}`);
  lines.push(`- Property: ${[project.property.address, project.property.city, project.property.state].filter(Boolean).join(", ") || "Missing"}`);
  lines.push(`- Property size: ${project.property.squareFootage ? `${project.property.squareFootage.toLocaleString()} sqft` : "Missing"}`);
  lines.push(`- Bed/bath: ${project.property.bedrooms || 0} bed / ${project.property.bathrooms || 0} bath`);
  lines.push(`- Target guests: ${project.targetGuests || "Missing"}`);
  lines.push(`- Current sleep capacity: ${sleeping}`);
  lines.push(`- Style: ${project.style.replace(/-/g, " ")}`);
  lines.push(`- Design budget: ${project.budget ? `$${project.budget.toLocaleString()}` : "Missing"}`);
  lines.push("");

  lines.push("## Source Evidence Checklist");
  for (const item of readiness.sourceItems) {
    lines.push(`- [${item.complete ? "x" : " "}] ${item.label}: ${item.detail}`);
  }
  lines.push(`- Matterport: ${project.property.matterportLink || project.property.matterportModelId || "Missing"}`);
  lines.push(`- Polycam: ${project.property.polycamLink || "Missing"}`);
  lines.push(`- Floor plans: ${(project.property.floorPlans ?? []).map(plan => plan.name).join(", ") || "Missing"}`);
  lines.push("");

  lines.push("## Floor-Plan / Scale Gate");
  lines.push(`- Status: ${readiness.floorPlanGateOpen ? "OPEN" : "BLOCKED"}`);
  lines.push(`- Layout canvases: ${(project.layoutCanvases ?? []).length}`);
  lines.push(`- Calibrated canvases: ${(project.layoutCanvases ?? []).filter(canvas => !!canvas.calibration).length}`);
  lines.push(`- Placed layout items: ${(project.layoutCanvases ?? []).reduce((sum, canvas) => sum + (canvas.shapes?.length ?? 0), 0)}`);
  lines.push("");

  lines.push("## Room Inventory");
  if (project.rooms.length === 0) {
    lines.push("- No rooms created yet.");
  } else {
    for (const room of project.rooms) {
      const roomTotal = room.furniture.reduce((sum, row) => sum + row.item.price * row.quantity, 0);
      lines.push(`- ${room.name} (${room.type.replace(/-/g, " ")}): ${room.widthFt || "?"}ft x ${room.lengthFt || "?"}ft, floor ${room.floor || "?"}, furniture rows ${room.furniture.length}, room total $${roomTotal.toLocaleString()}`);
      if (room.selectedBedConfig) lines.push(`  - Sleep: ${room.selectedBedConfig.name}, sleeps ${room.selectedBedConfig.totalSleeps}`);
      if (room.notes) lines.push(`  - Notes: ${room.notes}`);
    }
  }
  lines.push("");

  lines.push("## Furniture Scope Readiness");
  lines.push(`- Status: ${readiness.furnitureScopeReady ? "READY" : "BLOCKED"}`);
  lines.push(`- Furniture total: $${furnitureTotal.toLocaleString()}`);
  lines.push("- Rule: do not treat furniture scope as final until floor plan scale is calibrated and room concepts are selected.");
  lines.push("");

  lines.push("## Assumptions");
  if (readiness.assumptions.length === 0) lines.push("- None captured.");
  readiness.assumptions.forEach(item => lines.push(`- ${item}`));
  lines.push("");

  lines.push("## Blockers");
  if (readiness.blockers.length === 0) lines.push("- None. Ready for Scout QA.");
  readiness.blockers.forEach(item => lines.push(`- ${item}`));
  lines.push("");

  lines.push("## V1 Workflow Spine");
  lines.push("1. Start from Matterport / Polycam / scan evidence.");
  lines.push("2. Create or finish the floor plan from the scan.");
  lines.push("3. Calibrate scale and place furniture/items appropriately on the floor plan.");
  lines.push("4. Go room by room.");
  lines.push("5. Create/select room render concepts only after scale is real.");
  lines.push("6. Reverse-design chosen concepts into furniture rows and design boards.");
  lines.push("7. Export this Markdown scope and the masterlist/shopping sheet.");

  return lines.join("\n");
}
