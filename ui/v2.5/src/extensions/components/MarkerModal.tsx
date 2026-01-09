/**
 * MarkerModal - Enhanced marker editing modal
 *
 * A premium, cinema-style modal that wraps SceneMarkerForm for marker CRUD.
 * Features glass morphism, smooth animations, and keyboard support.
 *
 * Design: Dark Cinema Glass aesthetic with deep blacks and blue accents
 */
import React, { useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import * as GQL from "src/core/generated-graphql";
import { MarkerForm } from "./MarkerForm";
import "./MarkerModal.scss";

interface IMarkerModalProps {
  sceneId: string;
  marker?: GQL.SceneMarkerDataFragment;
  isOpen: boolean;
  onClose: () => void;
}

export const MarkerModal: React.FC<IMarkerModalProps> = ({
  sceneId,
  marker,
  isOpen,
  onClose,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Store previously focused element and restore on close
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      // Focus the modal after animation
      setTimeout(() => {
        modalRef.current?.focus();
      }, 100);
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus();
    }
  }, [isOpen]);

  // Handle escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      // Prevent body scroll when modal is open
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, handleKeyDown]);

  // Click outside to close
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  const isEditing = marker !== undefined;
  const title = isEditing ? "Edit Marker" : "Create Marker";

  const modalContent = (
    <div
      className="marker-modal-backdrop"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        className="marker-modal"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="marker-modal-title"
        tabIndex={-1}
      >
        {/* Header */}
        <div className="marker-modal-header">
          <h2 id="marker-modal-title" className="marker-modal-title">
            {title}
          </h2>
          <button
            className="marker-modal-close"
            onClick={onClose}
            aria-label="Close modal"
            type="button"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>

        {/* Body - MarkerForm (forked for custom layout) */}
        <div className="marker-modal-body">
          <MarkerForm
            sceneID={sceneId}
            marker={marker}
            onClose={onClose}
          />
        </div>
      </div>
    </div>
  );

  // Portal to body for proper stacking (with SSR check)
  if (typeof document === "undefined") return null;
  return createPortal(modalContent, document.body);
};

export default MarkerModal;
