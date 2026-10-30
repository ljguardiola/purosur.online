import type { CategorySummary } from "@purosur/contracts";
import { Button, Modal } from "@purosur/ui";
import { Plus } from "lucide-react";
import type { ReactElement } from "react";
import type { CreatedProduct, CreationModalProps } from "../creation-parts";
import type { RoleSummary } from "../roles-api";

function StubCreationModal({
  title,
  initialName,
  create,
  onClose,
}: {
  title: string;
  initialName: string;
  create: () => void;
  onClose: () => void;
}): ReactElement {
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      width="standard"
      tone="info"
      icon={<Plus />}
      context="Prueba"
      title={title}
      closable
      footer={
        <>
          <Button variant="secondary" size="large" onPress={onClose}>
            Cerrar lo creado
          </Button>
          <Button variant="primary" size="large" onPress={create}>
            Guardar lo creado
          </Button>
        </>
      }
    >
      <p>{`Nombre tipeado: ${initialName}`}</p>
    </Modal>
  );
}

function createdCategoryNamed(name: string): CategorySummary {
  return { id: "created-category", name, version: 1, parentId: null };
}

function createdProductNamed(name: string): CreatedProduct {
  return {
    id: "created-product",
    name,
    categoryId: "created-product-category",
    categoryName: "Almacén",
    brandId: null,
    brandName: null,
    saleUnit: "UNIT",
    barcodes: [],
    tagIds: [],
    netContent: null,
    active: true,
    labelCode: null,
    labelModules: null,
    version: 1,
  };
}

function createdRoleNamed(name: string): RoleSummary {
  return {
    id: "created-role",
    name,
    isAdministrator: false,
    permissionKeys: [],
    userCount: 0,
    mayEdit: true,
  };
}

export function StubCategoryCreationModal({
  open,
  initialName,
  onCreated,
  onClose,
}: CreationModalProps<CategorySummary>) {
  return open ? (
    <StubCreationModal
      title="Nueva categoría"
      initialName={initialName}
      create={() => onCreated(createdCategoryNamed(initialName))}
      onClose={onClose}
    />
  ) : null;
}

export function StubProductCreationModal({
  open,
  initialName,
  onCreated,
  onClose,
}: CreationModalProps<CreatedProduct>) {
  return open ? (
    <StubCreationModal
      title="Nuevo producto"
      initialName={initialName}
      create={() => onCreated(createdProductNamed(initialName))}
      onClose={onClose}
    />
  ) : null;
}

export function StubRoleCreationModal({
  open,
  initialName,
  onCreated,
  onClose,
}: CreationModalProps<RoleSummary>) {
  return open ? (
    <StubCreationModal
      title="Nuevo rol"
      initialName={initialName}
      create={() => onCreated(createdRoleNamed(initialName))}
      onClose={onClose}
    />
  ) : null;
}
