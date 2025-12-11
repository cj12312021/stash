/**
 * Fork-specific Sidebar Components
 *
 * This file contains fork-specific versions of sidebar components that maintain
 * compatibility with the extension system. The upstream version was modified
 * in ways that broke our custom extension UI.
 *
 * Key differences from upstream:
 * - SidebarPaneContent doesn't require onSidebarToggle prop
 * - SidebarToggleButton doesn't have container wrapper or minimal class
 */

import React, { PropsWithChildren } from "react";
import { Button } from "react-bootstrap";
import { useIntl } from "react-intl";
import { Icon } from "src/components/Shared/Icon";
import { faSliders } from "@fortawesome/free-solid-svg-icons";

// Re-export unchanged components from upstream
export {
  Sidebar,
  SidebarPane,
  SidebarSection,
  SidebarStateContext,
  defaultShowSidebar,
  useSidebarState,
} from "src/components/Shared/Sidebar";

export type { SidebarSectionStates } from "src/components/Shared/Sidebar";

/**
 * Fork-specific SidebarPaneContent
 * 
 * This version doesn't require onSidebarToggle and doesn't include
 * the SidebarToggleButton inside it - allowing extensions to place
 * the toggle button where needed.
 */
export const SidebarPaneContent: React.FC<PropsWithChildren<{}>> = ({
  children,
}) => {
  return <div className="sidebar-pane-content">{children}</div>;
};

/**
 * Fork-specific SidebarToggleButton
 * 
 * This version doesn't have the container wrapper or minimal class,
 * which works better with the extension's toolbar layout.
 */
export const SidebarToggleButton: React.FC<{
  onClick: () => void;
}> = ({ onClick }) => {
  const intl = useIntl();
  return (
    <Button
      className="sidebar-toggle-button ignore-sidebar-outside-click"
      variant="secondary"
      onClick={onClick}
      title={intl.formatMessage({ id: "actions.sidebar.toggle" })}
    >
      <Icon icon={faSliders} />
    </Button>
  );
};

