# Floor Plan Canvas: Feature Spec & Architecture Plan

## 1. Overview & Goal
The current workflow attempts to extract perfect room data from floor plans immediately upon upload. However, interior designers typically use floor plans as a **visual working canvas** to plan spatial layouts before moving into room-by-room styling. 

This spec outlines a new **Floor Plan Canvas** feature that aligns with how designers actually work (similar to Spoak's "Image Background" workflow). Designers will upload a floor plan image, set the scale by marking a single wall, and drag-and-drop to-scale furniture shapes onto the plan to figure out what fits.

## 2. User Experience (UX) Flow

### Step 1: Upload & Setup
- The designer uploads a Matterport floor plan (PNG/JPG) or PDF in the Brief tab.
- They navigate to a new **"Layout"** tab (or a sub-view in the Design tab).
- The uploaded floor plan appears as the background of a large, zoomable/pannable 2D canvas.

### Step 2: Setting the Scale
- Before placing furniture, the designer must calibrate the canvas scale.
- They click a "Set Scale" button.
- They click two points on the floor plan (e.g., the two ends of a living room wall).
- A prompt asks: "How long is this wall in real life?"
- The designer enters the dimension (e.g., "14 ft" or "168 in").
- The app calculates the `pixelsPerFoot` ratio for the entire canvas.

### Step 3: Placing Furniture Shapes
- A sidebar displays a library of **Furniture Shapes** (top-down SVG icons for beds, sofas, tables, rugs, etc.).
- The designer drags a shape onto the floor plan.
- Because the scale is set, a "Queen Bed" shape automatically sizes itself to exactly 60" × 80" relative to the floor plan.
- The designer can click any placed shape to adjust its dimensions (Width × Depth) in a properties panel. The shape resizes instantly on the canvas.
- Shapes can be rotated (90-degree snaps or free rotation) and duplicated.

### Step 4: Connecting to Sourcing (Future Phase)
- The shapes placed on the floor plan act as "placeholders" or "specs" for the room.
- When the designer moves to the Room Designer to source real products, the app knows: "This room needs a sofa that is roughly 84" × 36"."
- When a real product is sourced, its actual dimensions update the placeholder shape on the floor plan.

## 3. Technical Architecture

### 3.1 Data Model Updates
We will extend the existing `Project` and `Room` models in `src/lib/types.ts` to support the new canvas data.

```typescript
// New interface for top-down shapes placed on the canvas
export interface FloorPlanShape {
  id: string;
  type: "bed" | "sofa" | "table" | "rug" | "chair" | "storage" | "fixture" | "custom";
  label: string;         // e.g., "King Bed", "Dining Table"
  widthIn: number;       // Real-world width in inches
  depthIn: number;       // Real-world depth in inches
  x: number;             // Canvas X coordinate (pixels or percentage)
  y: number;             // Canvas Y coordinate (pixels or percentage)
  rotation: number;      // 0-360 degrees
  color?: string;        // Fill color for the shape
  roomId?: string;       // Optional: which room this belongs to
  linkedItemId?: string; // Optional: ID of the sourced FurnitureItem
}

// Extend FloorPlan to store scale calibration
export interface FloorPlan {
  // ... existing fields ...
  pixelsPerFoot?: number;
  calibrationLine?: {
    x1: number; y1: number;
    x2: number; y2: number;
    realLengthFt: number;
  };
  shapes?: FloorPlanShape[];
}
```

### 3.2 Component Structure
We will build a new set of components, likely replacing or heavily modifying the current `SpacePlanner.tsx`.

1. **`FloorPlanCanvas.tsx`**: The main interactive area.
   - Handles pan/zoom using CSS transforms or a library like `react-zoom-pan-pinch`.
   - Renders the background image.
   - Renders the `CalibrationTool` overlay when setting scale.
   - Renders all `FloorPlanShape` items.
   - Handles drag-and-drop positioning.

2. **`ShapeLibrarySidebar.tsx`**: The left/right panel.
   - Lists draggable preset shapes (e.g., King Bed: 76x80, Queen Bed: 60x80, 3-Seat Sofa: 84x36).
   - Uses HTML5 Drag and Drop API or a simple pointer-event implementation to drop onto the canvas.

3. **`ShapePropertiesPanel.tsx`**: Context menu when a shape is selected.
   - Inputs for Width and Depth (inches or feet).
   - Rotation controls.
   - Color picker.
   - Delete button.

### 3.3 The Scale Math
The core of this feature is the scale math.
1. User clicks $(x_1, y_1)$ and $(x_2, y_2)$ on the image.
2. Pixel distance $D = \sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2}$.
3. User inputs real length $L$ in feet.
4. `pixelsPerFoot` = $D / L$.
5. When rendering a shape with real width $W_{in}$ and depth $H_{in}$:
   - Canvas Width = $(W_{in} / 12) \times \text{pixelsPerFoot}$
   - Canvas Height = $(H_{in} / 12) \times \text{pixelsPerFoot}$

## 4. Implementation Phases

**Phase 1: Core Canvas & Scale (Immediate Next Step)**
- Build the basic `FloorPlanCanvas` component.
- Implement the background image rendering with pan/zoom.
- Implement the "Set Scale" tool (draw a line, enter feet, save `pixelsPerFoot`).

**Phase 2: Shape Library & Placement**
- Create the SVG assets for top-down furniture (beds, sofas, tables).
- Build the drag-and-drop sidebar.
- Render shapes on the canvas using the calculated scale.
- Add selection, resizing (via properties panel), and rotation.

**Phase 3: Integration & Polish**
- Save shape data to the `Project` store.
- Add text labels and basic drawing tools (lines/rectangles).
- Ensure mobile responsiveness (though this tool is primarily for desktop/tablet use).

## 5. Why this approach?
- **Matches Designer Mental Models**: Designers think in spatial relationships first, not data extraction.
- **Bypasses OCR Unreliability**: We don't need perfect AI extraction of room bounds if the designer is just using the image as a visual reference.
- **Scalable**: This foundation allows us to eventually link these top-down shapes directly to the 3D/perspective composite boards.
