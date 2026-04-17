"use client";

import { useState } from "react";
import { getTotalSleeping } from "@/lib/sleep-optimizer";
import ShareLinkButton from "./ShareLinkButton";
import type { Project } from "@/lib/types";

interface Props {
  project: Project;
}

/**
 * Client-facing presentation view.
 * Clean, professional layout showing the full design package.
 * Meant to be shared via link or exported as PDF.
 */
export default function ClientDelivery({ project }: Props) {
  const [section, setSection] = useState<string>("all");

  const sleeping = getTotalSleeping(project.rooms);
  const totalItems = project.rooms.reduce((s, r) => s + r.furniture.length, 0);
  const totalCost = project.rooms.reduce(
    (s, r) => s + r.furniture.reduce((fs, f) => fs + f.item.price * f.quantity, 0),
    0
  );

  const sections = [
    { id: "all", label: "Full Package" },
    { id: "overview", label: "Overview" },
    { id: "rooms", label: "Room Plans" },
    { id: "furniture", label: "Furniture" },
    { id: "mood", label: "Design Direction" },
    { id: "budget", label: "Budget" },
  ];

  const show = (id: string) => section === "all" || section === id;

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">Client Presentation</h2>
          <p className="text-sm text-brand-600">
            Professional design package ready to share with your client.
            Use the Print button for a clean PDF.
          </p>
        </div>
        <div className="flex gap-2">
          <ShareLinkButton project={project} />
          <button
            onClick={() => window.open(`/projects/print?id=${project.id}`, "_blank")}
            className="btn-secondary btn-sm"
          >
            Print PDF
          </button>
          {project.property.spoakLink && (
            <a
              href={project.property.spoakLink}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-accent btn-sm"
            >
              Open in Spoak
            </a>
          )}
        </div>
      </div>

      {/* Section Filter */}
      <div className="flex flex-wrap gap-1 mb-6 rounded-xl bg-white border border-brand-900/10 p-1 w-fit">
        {sections.map(s => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={section === s.id ? "tab-active" : "tab"}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Presentation Content */}
      <div className="space-y-8">
        {/* Cover */}
        {show("overview") && (
          <div className="card bg-brand-900 text-white p-8">
            <div className="text-xs uppercase tracking-widest text-amber mb-2">Design Package</div>
            <h1 className="text-3xl font-bold mb-2">{project.name || "Untitled Project"}</h1>
            <p className="text-white/60">
              {project.property.address} &middot; {project.property.city}, {project.property.state}
            </p>
            <div className="grid grid-cols-4 gap-6 mt-8 pt-6 border-t border-white/10">
              <div>
                <div className="text-2xl font-bold text-amber">{project.rooms.length}</div>
                <div className="text-xs text-white/50">Rooms</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-amber">{sleeping}</div>
                <div className="text-xs text-white/50">Guests</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-amber">{totalItems}</div>
                <div className="text-xs text-white/50">Items</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-amber">${totalCost.toLocaleString()}</div>
                <div className="text-xs text-white/50">Total Budget</div>
              </div>
            </div>
          </div>
        )}

        {/* Property Overview */}
        {show("overview") && (
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">Property Overview</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-brand-600">Size</div>
                <div className="font-medium">{project.property.squareFootage.toLocaleString()} sqft</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-brand-600">Layout</div>
                <div className="font-medium">{project.property.bedrooms}bd / {project.property.bathrooms}ba</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-brand-600">Style</div>
                <div className="font-medium capitalize">{project.style.replace(/-/g, " ")}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-brand-600">Floors</div>
                <div className="font-medium">{project.property.floors}</div>
              </div>
            </div>
            {project.client.preferences && (
              <div className="mt-4 pt-4 border-t border-brand-900/5">
                <div className="text-[10px] uppercase tracking-wider text-brand-600 mb-1">Client Notes</div>
                <p className="text-sm text-brand-700">{project.client.preferences}</p>
              </div>
            )}
          </div>
        )}

        {/* Room Plans */}
        {show("rooms") && (
          <div>
            <h3 className="text-lg font-semibold mb-4">Room-by-Room Plan</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {project.rooms.map(room => {
                const roomCost = room.furniture.reduce((s, f) => s + f.item.price * f.quantity, 0);
                const sleeps = room.selectedBedConfig?.totalSleeps ?? 0;

                return (
                  <div key={room.id} className="card">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="font-semibold text-brand-900">{room.name}</h4>
                        <span className="text-xs text-brand-600 capitalize">{room.type.replace(/-/g, " ")}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-brand-900">${roomCost.toLocaleString()}</div>
                        <div className="text-[10px] text-brand-600">{room.furniture.length} items</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                      <div className="rounded bg-brand-900/5 px-2 py-1.5 text-center">
                        <div className="font-semibold text-brand-900">{room.widthFt}&apos; x {room.lengthFt}&apos;</div>
                        <div className="text-[10px] text-brand-600">Size</div>
                      </div>
                      <div className="rounded bg-brand-900/5 px-2 py-1.5 text-center">
                        <div className="font-semibold text-brand-900">{room.ceilingHeightFt}&apos;</div>
                        <div className="text-[10px] text-brand-600">Ceiling</div>
                      </div>
                      {sleeps > 0 && (
                        <div className="rounded bg-amber/10 px-2 py-1.5 text-center">
                          <div className="font-semibold text-amber-dark">{sleeps}</div>
                          <div className="text-[10px] text-brand-600">Sleeps</div>
                        </div>
                      )}
                    </div>

                    {room.selectedBedConfig && (
                      <div className="text-xs text-brand-700 mb-2">
                        <span className="font-medium">Bed Config:</span> {room.selectedBedConfig.name}
                      </div>
                    )}

                    {room.furniture.length > 0 && (
                      <div className="border-t border-brand-900/5 pt-2 mt-2 space-y-1">
                        {room.furniture.slice(0, 5).map(f => (
                          <div key={f.item.id} className="flex justify-between text-xs">
                            <span className="text-brand-700 truncate">{f.item.name}</span>
                            <span className="text-brand-600 shrink-0 ml-2">${f.item.price}</span>
                          </div>
                        ))}
                        {room.furniture.length > 5 && (
                          <div className="text-[10px] text-brand-600/60">
                            +{room.furniture.length - 5} more items
                          </div>
                        )}
                      </div>
                    )}

                    {room.features.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {room.features.map(f => (
                          <span key={f} className="badge-neutral text-[9px]">{f}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Design Direction / Mood Boards */}
        {show("mood") && project.moodBoards.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-4">Design Direction</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {project.moodBoards.map(board => (
                <div key={board.id} className="card">
                  <div className="mb-4 flex h-20 overflow-hidden rounded-lg">
                    {board.colorPalette.map((color, i) => (
                      <div key={i} className="flex-1" style={{ backgroundColor: color }} />
                    ))}
                  </div>
                  <h4 className="font-semibold text-brand-900 mb-1">{board.name}</h4>
                  <span className="badge-neutral text-[10px] capitalize mb-3 inline-block">
                    {board.style.replace(/-/g, " ")}
                  </span>
                  <div className="flex gap-2 mt-3">
                    {board.colorPalette.map((color, i) => (
                      <div key={i} className="text-center">
                        <div className="h-10 w-10 rounded-lg border border-brand-900/10" style={{ backgroundColor: color }} />
                        <span className="text-[8px] text-brand-600 mt-0.5 block font-mono">{color}</span>
                      </div>
                    ))}
                  </div>
                  {board.inspirationNotes && (
                    <p className="mt-3 text-sm text-brand-700 border-t border-brand-900/5 pt-3">
                      {board.inspirationNotes}
                    </p>
                  )}
                  {board.imageUrls && board.imageUrls.length > 0 && (
                    <div className="mt-3 grid grid-cols-3 gap-1.5 border-t border-brand-900/5 pt-3">
                      {board.imageUrls.slice(0, 6).map((url, i) => (
                        <div key={i} className="aspect-square rounded overflow-hidden bg-brand-900/5">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt=""
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = "none";
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Furniture & Budget */}
        {show("furniture") && (
          <div>
            <h3 className="text-lg font-semibold mb-4">Furniture Selections</h3>
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brand-900/10 text-left">
                    <th className="pb-2 pr-4 text-xs font-semibold uppercase tracking-wider text-brand-600">Room</th>
                    <th className="pb-2 pr-4 text-xs font-semibold uppercase tracking-wider text-brand-600">Item</th>
                    <th className="pb-2 pr-4 text-xs font-semibold uppercase tracking-wider text-brand-600">Vendor</th>
                    <th className="pb-2 pr-4 text-xs font-semibold uppercase tracking-wider text-brand-600">Dimensions</th>
                    <th className="pb-2 text-xs font-semibold uppercase tracking-wider text-brand-600 text-right">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {project.rooms.flatMap(room =>
                    room.furniture.map(f => (
                      <tr key={`${room.id}-${f.item.id}`} className="border-b border-brand-900/5 last:border-0">
                        <td className="py-2 pr-4 text-brand-600">{room.name}</td>
                        <td className="py-2 pr-4 font-medium text-brand-900">{f.item.name}</td>
                        <td className="py-2 pr-4 text-brand-600">{f.item.vendor}</td>
                        <td className="py-2 pr-4 text-brand-600 text-xs">
                          {f.item.widthIn}&quot;W x {f.item.depthIn}&quot;D x {f.item.heightIn}&quot;H
                        </td>
                        <td className="py-2 text-right font-medium">${(f.item.price * f.quantity).toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-brand-900/20">
                    <td colSpan={4} className="py-3 text-right font-semibold text-brand-900">Grand Total</td>
                    <td className="py-3 text-right text-lg font-bold text-brand-900">${totalCost.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Budget Summary */}
        {show("budget") && (
          <div>
            <h3 className="text-lg font-semibold mb-4">Budget Summary</h3>
            <div className="grid gap-4 sm:grid-cols-3 mb-6">
              <div className="card text-center">
                <div className="text-3xl font-bold text-brand-900">${totalCost.toLocaleString()}</div>
                <div className="text-xs text-brand-600 mt-1">Total Furniture Cost</div>
              </div>
              <div className="card text-center">
                <div className="text-3xl font-bold text-brand-900">
                  ${project.property.squareFootage > 0 ? (totalCost / project.property.squareFootage).toFixed(0) : "—"}
                </div>
                <div className="text-xs text-brand-600 mt-1">Per Square Foot</div>
              </div>
              <div className="card text-center">
                {project.budget > 0 ? (
                  <>
                    <div className={`text-3xl font-bold ${totalCost > project.budget ? "text-red-500" : "text-emerald-600"}`}>
                      {totalCost > project.budget ? "Over" : "Under"}
                    </div>
                    <div className="text-xs text-brand-600 mt-1">
                      ${Math.abs(totalCost - project.budget).toLocaleString()} {totalCost > project.budget ? "over" : "remaining"}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-3xl font-bold text-brand-600">—</div>
                    <div className="text-xs text-brand-600 mt-1">No budget set</div>
                  </>
                )}
              </div>
            </div>

            {/* Room breakdown */}
            <div className="card">
              <h4 className="font-semibold mb-3">Cost by Room</h4>
              <div className="space-y-2">
                {project.rooms
                  .map(r => ({
                    name: r.name,
                    cost: r.furniture.reduce((s, f) => s + f.item.price * f.quantity, 0),
                  }))
                  .filter(r => r.cost > 0)
                  .sort((a, b) => b.cost - a.cost)
                  .map(r => (
                    <div key={r.name} className="flex items-center gap-3">
                      <span className="text-sm text-brand-700 w-32 shrink-0">{r.name}</span>
                      <div className="flex-1 h-2 rounded-full bg-brand-900/5">
                        <div
                          className="h-2 rounded-full bg-amber"
                          style={{ width: `${totalCost > 0 ? (r.cost / totalCost) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-brand-900 w-20 text-right">${r.cost.toLocaleString()}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* Spoak Delivery */}
        {project.property.spoakLink && show("overview") && (
          <div className="card bg-purple-50 border-purple-200">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100 text-purple-600 font-bold text-lg">
                S
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-brand-900">Deliver via Spoak</h3>
                <p className="text-xs text-brand-600">
                  Your design board is ready on Spoak. Share this link with your client for an interactive presentation.
                </p>
              </div>
              <a
                href={project.property.spoakLink}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary btn-sm bg-purple-600 hover:bg-purple-700"
              >
                Open Spoak Board
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
