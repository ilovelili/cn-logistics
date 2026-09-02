import * as React from "react";
import { Eye, Plus, Trash2, X } from "lucide-react";
import { t, type TranslationKey } from "../lib/i18n";
import InstantTooltip from "./InstantTooltip";
import {
  defaultShipmentJobForm,
  completedShipmentProgressColor,
  fetchShipmentTrackingEventTemplates,
  ShipmentJob,
  ShipmentDocument,
  ShipmentJobForm as ShipmentJobFormState,
  ShipmentTrackingEventTemplate,
  tradeModeOptions,
  transportModeOptions,
  jobToForm,
  linkShipmentProgressFromPercent,
  linkShipmentProgressFromStep,
  standardFlowStatusOptions,
} from "../lib/shipmentJobs";
import type { ShipperUser } from "../lib/shipperUsers";

type ShipmentShipperOption = Pick<
  ShipperUser,
  "shipper_name" | "email" | "contact_person" | "admin_assignments"
>;

interface ShipmentJobFormProps {
  job?: ShipmentJob | null;
  shipperOptions?: ShipmentShipperOption[];
  customerSelection?: boolean;
  fixedAssignedAdminEmail?: string;
  assignedAdminsReadOnly?: boolean;
  documents?: ShipmentDocument[];
  onPreviewDocument?: (document: ShipmentDocument) => void;
  onDeleteDocument?: (document: ShipmentDocument) => void;
  submitLabel: string;
  loading?: boolean;
  onCancel?: () => void;
  onSubmit: (form: ShipmentJobFormState) => Promise<void> | void;
}

type PendingFormDelete = {
  kind: "vessel";
  index: number;
  title: string;
  detail: string;
};

const manualProgressColorOptions = [
  {
    value: "#059669",
    label: t("progress.color.inProgress"),
    classes:
      "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
    activeClasses: "ring-2 ring-emerald-500 ring-offset-2",
  },
  {
    value: "#d97706",
    label: t("progress.color.warning"),
    classes: "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100",
    activeClasses: "ring-2 ring-amber-500 ring-offset-2",
  },
  {
    value: "#64748b",
    label: t("progress.color.invalid"),
    classes: "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200",
    activeClasses: "ring-2 ring-slate-500 ring-offset-2",
  },
  {
    value: "#e11d48",
    label: t("progress.color.alert"),
    classes: "border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100",
    activeClasses: "ring-2 ring-rose-500 ring-offset-2",
  },
  {
    value: completedShipmentProgressColor,
    label: t("progress.color.completed"),
    classes:
      "col-span-2 border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100",
    activeClasses: "ring-2 ring-blue-500 ring-offset-2",
  },
] as const;

export default function ShipmentJobForm({
  job,
  shipperOptions = [],
  customerSelection = false,
  fixedAssignedAdminEmail,
  assignedAdminsReadOnly = false,
  documents = [],
  onPreviewDocument,
  onDeleteDocument,
  submitLabel,
  loading = false,
  onCancel,
  onSubmit,
}: ShipmentJobFormProps) {
  const [form, setForm] = useShipmentForm(job);
  const [pendingDelete, setPendingDelete] =
    React.useState<PendingFormDelete | null>(null);
  const [trackingTemplates, setTrackingTemplates] = React.useState<
    ShipmentTrackingEventTemplate[]
  >([]);
  const [trackingTemplatesLoading, setTrackingTemplatesLoading] =
    React.useState(true);
  const [trackingTemplatesFailed, setTrackingTemplatesFailed] =
    React.useState(false);
  const [selectedStandardFlowName, setSelectedStandardFlowName] =
    React.useState("door_to_door");
  const [standardFlowPickerOpen, setStandardFlowPickerOpen] =
    React.useState(false);
  const [showTrackingValidationWarning, setShowTrackingValidationWarning] =
    React.useState(false);
  const [showCnAssignmentWarning, setShowCnAssignmentWarning] =
    React.useState(false);
  const [showContainerValidationWarning, setShowContainerValidationWarning] =
    React.useState(false);

  React.useEffect(() => {
    let active = true;

    fetchShipmentTrackingEventTemplates()
      .then((templates) => {
        if (active) {
          setTrackingTemplatesFailed(false);
          setTrackingTemplates(templates);
          setSelectedStandardFlowName((currentFlowName) =>
            templates.some((template) => template.flow_name === currentFlowName)
              ? currentFlowName
              : (templates[0]?.flow_name ?? "door_to_door"),
          );
        }
      })
      .catch(() => {
        if (active) {
          setTrackingTemplatesFailed(true);
          setTrackingTemplates([]);
        }
      })
      .finally(() => {
        if (active) setTrackingTemplatesLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const inferredFlowName = React.useMemo(
    () => inferStandardFlowName(form.tracking_events, trackingTemplates),
    [form.tracking_events, trackingTemplates],
  );

  React.useEffect(() => {
    if (inferredFlowName) setSelectedStandardFlowName(inferredFlowName);
  }, [inferredFlowName]);

  const progressTemplates = React.useMemo(
    () =>
      inferredFlowName
        ? trackingTemplates
            .filter((template) => template.flow_name === inferredFlowName)
            .sort((first, second) => first.sort_order - second.sort_order)
        : [],
    [inferredFlowName, trackingTemplates],
  );
  const definedTrackingStepCount = form.tracking_events.filter((event) =>
    event.description.trim(),
  ).length;
  const totalProgressSteps = Math.max(
    1,
    progressTemplates.length ||
      definedTrackingStepCount ||
      form.progress_total_steps ||
      Number(form.progress_step) ||
      1,
  );
  const hasDefinedProgressFlow =
    progressTemplates.length > 0 || definedTrackingStepCount > 0;
  const standardFlowStepDescriptions = React.useMemo(
    () =>
      new Set(
        trackingTemplates
          .map((template) => template.description.trim())
          .filter(Boolean),
      ),
    [trackingTemplates],
  );
  const hasIncompleteTrackingEvent = form.tracking_events.some((event) => {
    const hasDate = Boolean(event.event_date);
    const hasLocation = Boolean(event.location.trim());
    const hasDescription = Boolean(event.description.trim());
    const isStandardFlowStep = standardFlowStepDescriptions.has(
      event.description.trim(),
    );

    if (!hasDescription) return true;
    if (isStandardFlowStep && !hasDate && !hasLocation) return false;
    return !hasDate || !hasLocation;
  });
  const isCnAssignmentMissing =
    Boolean(job) && form.assigned_admin_user_ids.length === 0;
  const hasIncompleteContainerDetail = form.booking_details.some((booking) => {
    const hasBookingNumber = Boolean(booking.booking_number.trim());
    const startedContainers = booking.containers.filter(
      (container) => container.size.trim() || container.quantity.trim(),
    );
    const hasIncompleteContainer = startedContainers.some((container) => {
      const quantity = Number(container.quantity);
      return (
        !container.size.trim() ||
        container.quantity.trim() === "" ||
        !Number.isInteger(quantity) ||
        quantity <= 0
      );
    });
    const hasStartedBooking = hasBookingNumber || startedContainers.length > 0;

    return (
      hasStartedBooking &&
      (!hasBookingNumber ||
        startedContainers.length === 0 ||
        hasIncompleteContainer)
    );
  });
  const hasBlockingValidationError =
    hasIncompleteTrackingEvent ||
    isCnAssignmentMissing ||
    hasIncompleteContainerDetail;

  React.useEffect(() => {
    if (!hasIncompleteTrackingEvent) setShowTrackingValidationWarning(false);
  }, [hasIncompleteTrackingEvent]);

  React.useEffect(() => {
    if (!isCnAssignmentMissing) setShowCnAssignmentWarning(false);
  }, [isCnAssignmentMissing]);

  React.useEffect(() => {
    if (!hasIncompleteContainerDetail) {
      setShowContainerValidationWarning(false);
    }
  }, [hasIncompleteContainerDetail]);

  React.useEffect(() => {
    if (trackingTemplatesLoading || form.manual_progress_edited) return;

    const trackingStatus = getTrackingStatus(
      form.tracking_events,
      trackingTemplates,
    );
    const nextStatus = trackingStatus ?? "pickup";
    if (form.status !== nextStatus) {
      setForm((current) =>
        current.manual_progress_edited || current.status === nextStatus
          ? current
          : { ...current, status: nextStatus },
      );
    }
  }, [
    form.manual_progress_edited,
    form.status,
    form.tracking_events,
    setForm,
    trackingTemplates,
    trackingTemplatesLoading,
  ]);

  React.useEffect(() => {
    if (!hasDefinedProgressFlow) return;

    setForm((current) => {
      const parsedProgressStep = Number(current.progress_step);
      const boundedProgressStep = current.progress_percent.trim()
        ? linkShipmentProgressFromPercent(
            current.progress_percent,
            totalProgressSteps,
          ).progress_step
        : current.progress_step.trim()
          ? String(
              Math.max(
                1,
                Math.min(
                  totalProgressSteps,
                  Number.isFinite(parsedProgressStep)
                    ? Math.round(parsedProgressStep)
                    : 1,
                ),
              ),
            )
          : current.progress_step;

      if (
        current.progress_total_steps === totalProgressSteps &&
        current.progress_step === boundedProgressStep
      ) {
        return current;
      }

      return {
        ...current,
        progress_step: boundedProgressStep,
        progress_total_steps: totalProgressSteps,
      };
    });
  }, [hasDefinedProgressFlow, setForm, totalProgressSteps]);

  const updateField = <Key extends keyof ShipmentJobFormState>(
    key: Key,
    value: ShipmentJobFormState[Key],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateProgressPercent = (value: string) => {
    setForm((current) => {
      const linkedProgress = linkShipmentProgressFromPercent(
        value,
        totalProgressSteps,
      );
      return {
        ...current,
        ...linkedProgress,
        progress_total_steps: totalProgressSteps,
        manual_progress_edited: true,
        status: getProgressStatus(
          progressTemplates,
          linkedProgress,
          current.status,
        ),
      };
    });
  };

  const updateProgressStep = (value: string) => {
    setForm((current) => {
      const linkedProgress = linkShipmentProgressFromStep(
        value,
        totalProgressSteps,
      );
      return {
        ...current,
        ...linkedProgress,
        progress_total_steps: totalProgressSteps,
        manual_progress_edited: true,
        status: getProgressStatus(
          progressTemplates,
          linkedProgress,
          current.status,
        ),
      };
    });
  };

  const updateShipper = (shipperName: string) => {
    const selectedAdminIds = getDefaultAssignedAdminIds(
      shipperName,
      shipperOptions,
      job ? undefined : fixedAssignedAdminEmail,
    );
    setForm((current) => ({
      ...current,
      shipper_name: shipperName,
      assigned_admin_user_ids: selectedAdminIds,
    }));
  };

  const availableAdminAssignments = getShipperAdminAssignments(
    form.shipper_name,
    shipperOptions,
  );
  const customerContacts = getShipperCustomerContacts(
    form.shipper_name,
    shipperOptions,
  );
  const shipperSelectOptions = buildShipperSelectOptions(
    shipperOptions,
    form.shipper_name,
    customerSelection ? t("form.selectCustomer") : t("form.selectShipper"),
  );
  const hasSelectableCustomer = shipperSelectOptions.length > 1;

  const toggleAssignedAdmin = (adminUserId: string) => {
    setForm((current) => ({
      ...current,
      assigned_admin_user_ids: current.assigned_admin_user_ids.includes(
        adminUserId,
      )
        ? current.assigned_admin_user_ids.filter((id) => id !== adminUserId)
        : [...current.assigned_admin_user_ids, adminUserId],
    }));
  };

  const updateVesselFlightNumber = (index: number, value: string) => {
    setForm((current) => ({
      ...current,
      vessel_flight_numbers: current.vessel_flight_numbers.map(
        (item, itemIndex) => (itemIndex === index ? value : item),
      ),
    }));
  };

  const addVesselFlightNumber = () => {
    setForm((current) => ({
      ...current,
      vessel_flight_numbers: [...current.vessel_flight_numbers, ""],
    }));
  };

  const updateBookingNumber = (bookingIndex: number, value: string) => {
    setForm((current) => ({
      ...current,
      booking_details: current.booking_details.map((booking, index) =>
        index === bookingIndex
          ? { ...booking, booking_number: value }
          : booking,
      ),
    }));
  };

  const updateContainerDetail = (
    bookingIndex: number,
    containerIndex: number,
    field: "size" | "quantity",
    value: string,
  ) => {
    setForm((current) => ({
      ...current,
      booking_details: current.booking_details.map((booking, index) =>
        index === bookingIndex
          ? {
              ...booking,
              containers: booking.containers.map((container, itemIndex) =>
                itemIndex === containerIndex
                  ? { ...container, [field]: value }
                  : container,
              ),
            }
          : booking,
      ),
    }));
  };

  const addBookingDetail = () => {
    setForm((current) => ({
      ...current,
      booking_details: [
        ...current.booking_details,
        {
          booking_number: "",
          containers: [{ size: "", quantity: "" }],
        },
      ],
    }));
  };

  const removeBookingDetail = (bookingIndex: number) => {
    setForm((current) => {
      const nextBookings = current.booking_details.filter(
        (_, index) => index !== bookingIndex,
      );
      return {
        ...current,
        booking_details:
          nextBookings.length > 0
            ? nextBookings
            : [
                {
                  booking_number: "",
                  containers: [{ size: "", quantity: "" }],
                },
              ],
      };
    });
  };

  const addContainerDetail = (bookingIndex: number) => {
    setForm((current) => ({
      ...current,
      booking_details: current.booking_details.map((booking, index) =>
        index === bookingIndex
          ? {
              ...booking,
              containers: [...booking.containers, { size: "", quantity: "" }],
            }
          : booking,
      ),
    }));
  };

  const removeContainerDetail = (
    bookingIndex: number,
    containerIndex: number,
  ) => {
    setForm((current) => ({
      ...current,
      booking_details: current.booking_details.map((booking, index) => {
        if (index !== bookingIndex) return booking;
        const nextContainers = booking.containers.filter(
          (_, itemIndex) => itemIndex !== containerIndex,
        );
        return {
          ...booking,
          containers:
            nextContainers.length > 0
              ? nextContainers
              : [{ size: "", quantity: "" }],
        };
      }),
    }));
  };

  const removeVesselFlightNumber = (index: number) => {
    setForm((current) => {
      const nextNumbers = current.vessel_flight_numbers.filter(
        (_, itemIndex) => itemIndex !== index,
      );

      return {
        ...current,
        vessel_flight_numbers: nextNumbers.length > 0 ? nextNumbers : [""],
      };
    });
  };

  const updateTrackingEvent = (
    index: number,
    field: keyof ShipmentJobFormState["tracking_events"][number],
    value: string,
  ) => {
    setForm((current) => ({
      ...current,
      manual_progress_edited: false,
      tracking_events: current.tracking_events.map((event, eventIndex) =>
        eventIndex === index ? { ...event, [field]: value } : event,
      ),
    }));
  };

  const addTrackingEvent = () => {
    setForm((current) => ({
      ...current,
      manual_progress_edited: false,
      tracking_events: [
        ...current.tracking_events,
        { event_date: "", location: "", description: "" },
      ],
    }));
  };

  const removeTrackingEvent = (index: number) => {
    setForm((current) => ({
      ...current,
      manual_progress_edited: false,
      tracking_events: current.tracking_events.filter(
        (_, eventIndex) => eventIndex !== index,
      ),
    }));
  };

  const addDefaultTrackingFlow = (flowName: string) => {
    const selectedTemplates = trackingTemplates.filter(
      (template) => template.flow_name === flowName,
    );

    setForm((current) => {
      const selectedTotalSteps = Math.max(1, selectedTemplates.length);
      const linkedProgress = current.progress_percent.trim()
        ? linkShipmentProgressFromPercent(
            current.progress_percent,
            selectedTotalSteps,
          )
        : linkShipmentProgressFromStep(
            current.progress_step,
            selectedTotalSteps,
          );

      return {
        ...current,
        ...linkedProgress,
        manual_progress_edited: false,
        progress_total_steps: selectedTotalSteps,
        tracking_events: [
          ...current.tracking_events,
          ...selectedTemplates.map((template) => ({
            event_date: "",
            location: "",
            description: template.description,
          })),
        ],
      };
    });
    setSelectedStandardFlowName(flowName);
    setStandardFlowPickerOpen(false);
  };

  const confirmPendingDelete = () => {
    if (!pendingDelete) {
      return;
    }

    removeVesselFlightNumber(pendingDelete.index);

    setPendingDelete(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setShowTrackingValidationWarning(hasIncompleteTrackingEvent);
    setShowCnAssignmentWarning(isCnAssignmentMissing);
    setShowContainerValidationWarning(hasIncompleteContainerDetail);
    if (hasBlockingValidationError) {
      return;
    }
    await onSubmit(form);
    if (!job) {
      setForm(defaultShipmentJobForm);
    }
  };

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {customerSelection || shipperOptions.length > 0 ? (
          <SelectField
            label={
              customerSelection
                ? t("form.customerName")
                : t("common.shipperName")
            }
            value={form.shipper_name}
            disabled={
              Boolean(job) || (customerSelection && !hasSelectableCustomer)
            }
            onChange={updateShipper}
            options={
              customerSelection && !hasSelectableCustomer
                ? [{ value: "", label: t("form.noCustomersAvailable") }]
                : shipperSelectOptions
            }
          />
        ) : (
          <TextField
            label={t("common.shipperName")}
            value={form.shipper_name}
            disabled={Boolean(job)}
            onChange={(value) => updateField("shipper_name", value)}
          />
        )}
        <SelectField
          label={t("form.tradeMode")}
          value={form.trade_mode}
          onChange={(value) =>
            updateField(
              "trade_mode",
              value as ShipmentJobFormState["trade_mode"],
            )
          }
          options={tradeModeOptions}
        />
        <TextField
          label={t("form.tradeTerm")}
          value={form.trade_term}
          onChange={(value) => updateField("trade_term", value)}
          placeholder="CIF / FOB / DDP"
        />
        <SelectField
          label={t("form.transportMode")}
          value={form.transport_mode}
          onChange={(value) =>
            updateField(
              "transport_mode",
              value as ShipmentJobFormState["transport_mode"],
            )
          }
          options={transportModeOptions}
        />
      </div>

      <BookingDetailFields
        values={form.booking_details}
        onAddBooking={addBookingDetail}
        onRemoveBooking={removeBookingDetail}
        onBookingNumberChange={updateBookingNumber}
        onAddContainer={addContainerDetail}
        onRemoveContainer={removeContainerDetail}
        onContainerChange={updateContainerDetail}
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <TextField
          label={t("form.invoice")}
          value={form.invoice_number}
          onChange={(value) => updateField("invoice_number", value)}
          placeholder="ABC-123"
        />
        <TextField
          label={t("common.jobNumber")}
          value={form.job_number}
          onChange={(value) => updateField("job_number", value)}
          placeholder="JOB-0001"
        />
        <TextField
          label="MBL/MAWB"
          value={form.mbl_mawb}
          onChange={(value) => updateField("mbl_mawb", value)}
          placeholder="1234567890"
        />
        <TextField
          label="HBL/HAWB"
          value={form.hbl_hawb}
          onChange={(value) => updateField("hbl_hawb", value)}
          placeholder="2345678901"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TextField
          label={t("form.consignor")}
          value={form.consignor_name}
          onChange={(value) => updateField("consignor_name", value)}
          placeholder="aaa Japan"
        />
        <TextField
          label={t("form.consignee")}
          value={form.consignee_name}
          onChange={(value) => updateField("consignee_name", value)}
          placeholder="bbb USA"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <TextField
          label="POL/AOL"
          value={form.pol_aol}
          onChange={(value) => updateField("pol_aol", value)}
          placeholder="Narita / Shanghai"
        />
        <TextField
          label="POD/AOD"
          value={form.pod_aod}
          onChange={(value) => updateField("pod_aod", value)}
          placeholder="NewYork / Tokyo"
        />
        <TextField
          label={t("common.blAwbDate")}
          type="date"
          value={form.bl_awb_date}
          onChange={(value) => updateField("bl_awb_date", value)}
        />
      </div>

      <VesselFlightNumberFields
        values={form.vessel_flight_numbers}
        onAdd={addVesselFlightNumber}
        onRemove={(index) =>
          setPendingDelete({
            kind: "vessel",
            index,
            title: `${formatOrdinal(index + 1)} ${t("common.vesselFlightNo")}`,
            detail: form.vessel_flight_numbers[index] || "-",
          })
        }
        onChange={updateVesselFlightNumber}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FileUploadField
          label={t("common.customerDocuments")}
          existingFiles={splitDocumentNames(form.documents)}
          existingDocuments={documents.filter(
            (document) => document.scope === "customer",
          )}
          files={form.document_files}
          onPreviewDocument={onPreviewDocument}
          onDeleteDocument={onDeleteDocument}
          onChange={(files) => updateField("document_files", files)}
        />
        <FileUploadField
          label={t("common.internalDocuments")}
          existingFiles={splitDocumentNames(form.internal_documents)}
          existingDocuments={documents.filter(
            (document) => document.scope === "internal",
          )}
          files={form.internal_document_files}
          onPreviewDocument={onPreviewDocument}
          onDeleteDocument={onDeleteDocument}
          onChange={(files) => updateField("internal_document_files", files)}
        />
      </div>

      <TextAreaField
        label={t("common.notes")}
        value={form.notes}
        onChange={(value) => updateField("notes", value)}
        placeholder={t("form.notesPlaceholder")}
      />

      <AssignedAdminFields
        assignments={availableAdminAssignments}
        selectedAdminIds={form.assigned_admin_user_ids}
        readOnly={
          assignedAdminsReadOnly || Boolean(!job && fixedAssignedAdminEmail)
        }
        onToggle={toggleAssignedAdmin}
      />

      <CustomerContactField contacts={customerContacts} />

      {hasDefinedProgressFlow ? (
        <ManualProgressFields
          progressPercent={form.progress_percent}
          progressStep={form.progress_step}
          progressColorHex={form.progress_color_hex}
          totalSteps={totalProgressSteps}
          onPercentChange={updateProgressPercent}
          onStepChange={updateProgressStep}
          onColorChange={(value) => updateField("progress_color_hex", value)}
        />
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            {t("progress.manualTitle")}
          </span>
          <p className="mt-3 text-sm font-semibold text-slate-600">
            {trackingTemplatesLoading
              ? t("progress.flowLoading")
              : trackingTemplatesFailed
                ? t("progress.flowLoadFailed")
                : t("progress.flowRequired")}
          </p>
        </div>
      )}

      <TrackingEventFields
        values={form.tracking_events}
        standardFlowStepDescriptions={standardFlowStepDescriptions}
        onAdd={addTrackingEvent}
        onAddDefaultFlow={() => setStandardFlowPickerOpen(true)}
        canAddDefaultFlow={trackingTemplates.length > 0}
        onChange={updateTrackingEvent}
        onRemove={removeTrackingEvent}
      />

      {standardFlowPickerOpen && (
        <StandardFlowPickerModal
          flowName={selectedStandardFlowName}
          flowOptions={getStandardFlowOptions(trackingTemplates)}
          onCancel={() => setStandardFlowPickerOpen(false)}
          onConfirm={addDefaultTrackingFlow}
        />
      )}

      <div className="flex flex-col sm:flex-row justify-end gap-3 pt-2">
        {(showTrackingValidationWarning ||
          showCnAssignmentWarning ||
          showContainerValidationWarning) && (
          <div
            role="alert"
            className="space-y-1 self-center text-sm font-semibold text-rose-600 sm:mr-auto"
          >
            {showTrackingValidationWarning && (
              <p>{t("tracking.completeAllFields")}</p>
            )}
            {showCnAssignmentWarning && (
              <p>{t("admin.shipment.cnAssignmentRequired")}</p>
            )}
            {showContainerValidationWarning && (
              <p>{t("form.containerDetailsRequired")}</p>
            )}
          </div>
        )}
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
          >
            {t("common.cancel")}
          </button>
        )}
        <button
          type="submit"
          disabled={loading || (customerSelection && !form.shipper_name)}
          aria-disabled={hasBlockingValidationError || undefined}
          title={
            hasIncompleteTrackingEvent
              ? t("tracking.completeAllFields")
              : isCnAssignmentMissing
                ? t("admin.shipment.cnAssignmentRequired")
                : hasIncompleteContainerDetail
                  ? t("form.containerDetailsRequired")
                  : undefined
          }
          className={`px-5 py-2.5 rounded-xl bg-slate-950 text-white font-semibold hover:bg-slate-800 disabled:opacity-60 transition-colors ${
            hasBlockingValidationError ? "opacity-60" : ""
          }`}
        >
          {loading ? t("common.saving") : submitLabel}
        </button>
      </div>

      {pendingDelete && (
        <FormDeleteConfirmModal
          title={pendingDelete.title}
          detail={pendingDelete.detail}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmPendingDelete}
        />
      )}
    </form>
  );
}

function useShipmentForm(job?: ShipmentJob | null) {
  const initial = job ? jobToForm(job) : defaultShipmentJobForm;
  const [form, setForm] = React.useState<ShipmentJobFormState>(initial);

  React.useEffect(() => {
    setForm(job ? jobToForm(job) : defaultShipmentJobForm);
  }, [job]);

  return [form, setForm] as const;
}

function getStandardFlowOptions(templates: ShipmentTrackingEventTemplate[]) {
  return [...new Set(templates.map((template) => template.flow_name))]
    .filter(Boolean)
    .sort((first, second) => first.localeCompare(second, "ja"));
}

function inferStandardFlowName(
  events: ShipmentJobFormState["tracking_events"],
  templates: ShipmentTrackingEventTemplate[],
) {
  const eventDescriptions = events.map((event) => event.description.trim());
  if (
    eventDescriptions.length === 0 ||
    eventDescriptions.some((description) => !description)
  ) {
    return undefined;
  }

  return getStandardFlowOptions(templates).find((flowName) => {
    const flowDescriptions = templates
      .filter((template) => template.flow_name === flowName)
      .sort((first, second) => first.sort_order - second.sort_order)
      .map((template) => template.description.trim());

    return (
      flowDescriptions.length === eventDescriptions.length &&
      flowDescriptions.every(
        (description, index) => description === eventDescriptions[index],
      )
    );
  });
}

function getTrackingStatus(
  events: ShipmentJobFormState["tracking_events"],
  templates: ShipmentTrackingEventTemplate[],
) {
  const latestEvent = events.reduce<
    | { event: ShipmentJobFormState["tracking_events"][number]; index: number }
    | undefined
  >((latest, event, index) => {
    if (!event.event_date || !event.description.trim()) return latest;
    if (!latest) return { event, index };
    if (event.event_date !== latest.event.event_date) {
      return event.event_date > latest.event.event_date
        ? { event, index }
        : latest;
    }
    return index > latest.index ? { event, index } : latest;
  }, undefined)?.event;

  if (!latestEvent) return undefined;

  const matchingStatuses = new Set(
    templates
      .filter(
        (template) =>
          template.is_active &&
          template.description.trim() === latestEvent.description.trim(),
      )
      .map((template) =>
        standardFlowStatusOptions.find(
          (option) => option.value === template.name,
        ),
      )
      .filter((option) => option !== undefined)
      .map((option) => option.value),
  );
  return matchingStatuses.size === 1 ? [...matchingStatuses][0] : undefined;
}

function getFlowStatus(
  templates: ShipmentTrackingEventTemplate[],
  progressStep: string,
) {
  const template = templates[Number(progressStep) - 1];
  return standardFlowStatusOptions.find(
    (option) => option.value === template?.name,
  )?.value;
}

function getIncompleteStatus(
  currentStatus: ShipmentJobFormState["status"],
  progressPercent: string,
) {
  if (progressPercent === "100") return currentStatus;
  return currentStatus === "completed" || currentStatus === "delivered"
    ? "pickup"
    : currentStatus;
}

function getProgressStatus(
  templates: ShipmentTrackingEventTemplate[],
  progress: { progress_percent: string; progress_step: string },
  currentStatus: ShipmentJobFormState["status"],
) {
  const flowStatus = getFlowStatus(templates, progress.progress_step);
  if (flowStatus === "delivered" && progress.progress_percent !== "100") {
    return getIncompleteStatus(currentStatus, progress.progress_percent);
  }
  return (
    flowStatus ?? getIncompleteStatus(currentStatus, progress.progress_percent)
  );
}

function StandardFlowPickerModal({
  flowName,
  flowOptions,
  onCancel,
  onConfirm,
}: {
  flowName: string;
  flowOptions: string[];
  onCancel: () => void;
  onConfirm: (flowName: string) => void;
}) {
  const initialFlowName = flowOptions.includes(flowName)
    ? flowName
    : (flowOptions[0] ?? flowName);
  const [selectedFlowName, setSelectedFlowName] =
    React.useState(initialFlowName);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900">
        <h3 className="text-lg font-black text-gray-900 dark:text-white">
          {t("tracking.selectStandardFlowTitle")}
        </h3>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          {t("tracking.selectStandardFlowHelp")}
        </p>
        <label className="mt-5 block">
          <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
            {t("tracking.standardFlow")}
          </span>
          <select
            value={selectedFlowName}
            disabled={flowOptions.length === 0}
            onChange={(event) => setSelectedFlowName(event.target.value)}
            className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm font-bold text-gray-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100 disabled:text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:ring-slate-800"
          >
            {flowOptions.length === 0 ? (
              <option value={selectedFlowName}>{selectedFlowName}</option>
            ) : (
              flowOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))
            )}
          </select>
        </label>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(selectedFlowName)}
            disabled={flowOptions.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            {t("tracking.addDefaultFlow")}
          </button>
        </div>
      </div>
    </div>
  );
}

function FormDeleteConfirmModal({
  title,
  detail,
  onCancel,
  onConfirm,
}: {
  title: string;
  detail: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900">
        <h3 className="text-lg font-black text-gray-900 dark:text-white">
          {t("common.deleteConfirmTitle")}
        </h3>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          {t("common.deleteConfirm")}
        </p>
        <div className="mt-4 rounded-xl bg-gray-50 p-4 dark:bg-gray-950">
          <div className="font-bold text-gray-900 dark:text-white">{title}</div>
          <div className="mt-1 break-words text-sm text-gray-500 dark:text-gray-400">
            {detail}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-rose-700"
          >
            {t("common.delete")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ManualProgressFields({
  progressPercent,
  progressStep,
  progressColorHex,
  totalSteps,
  onPercentChange,
  onStepChange,
  onColorChange,
}: {
  progressPercent: string;
  progressStep: string;
  progressColorHex: string;
  totalSteps: number;
  onPercentChange: (value: string) => void;
  onStepChange: (value: string) => void;
  onColorChange: (value: string) => void;
}) {
  const percentValue = clampNumericInput(progressPercent, 0, 100);
  const stepValue = clampNumericInput(progressStep, 1, totalSteps);
  const colorValue = getManualProgressColorValue(progressColorHex);
  const progressBarColor =
    percentValue === 100 ? completedShipmentProgressColor : colorValue;

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-4">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          {t("progress.manualTitle")}
        </span>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(180px,0.6fr)_minmax(180px,0.5fr)]">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            {t("progress.percent")}
          </span>
          <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0"
                max="100"
                value={percentValue}
                onChange={(event) => onPercentChange(event.target.value)}
                className="min-w-0 flex-1"
                style={{ accentColor: progressBarColor }}
              />
              <input
                type="number"
                min="0"
                max="100"
                value={progressPercent}
                onChange={(event) => onPercentChange(event.target.value)}
                className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right text-sm font-bold text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-4 focus:ring-slate-200"
                aria-label={t("progress.percent")}
              />
              <span className="text-sm font-bold text-slate-500">%</span>
            </div>
            <p className="mt-2 text-xs font-medium text-slate-500">
              {t("progress.percentHelp")}
            </p>
          </div>
        </label>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            {t("progress.step")}
          </span>
          <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="1"
                max={totalSteps}
                value={progressStep}
                onChange={(event) => onStepChange(event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-4 focus:ring-slate-200"
                aria-label={t("progress.step")}
              />
              <span className="whitespace-nowrap text-sm font-bold text-slate-500">
                / {totalSteps}
              </span>
            </div>
            <div
              className="mt-3 grid gap-1"
              style={{
                gridTemplateColumns: `repeat(${totalSteps}, minmax(0, 1fr))`,
              }}
              aria-hidden="true"
            >
              {Array.from({ length: totalSteps }, (_, index) => (
                <span
                  key={index}
                  className="h-1.5 rounded-full"
                  style={{
                    backgroundColor:
                      index < stepValue ? progressBarColor : "rgb(226 232 240)",
                  }}
                />
              ))}
            </div>
            <p className="mt-2 text-xs font-medium text-slate-500">
              {t("progress.stepHelp", { count: totalSteps })}
            </p>
          </div>
        </label>

        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            {t("progress.color")}
          </span>
          <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            {manualProgressColorOptions.map((option) => {
              const selected = option.value === colorValue;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onColorChange(option.value)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-bold transition ${option.classes} ${
                    selected ? option.activeClasses : ""
                  }`}
                  aria-pressed={selected}
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: option.value }}
                  />
                  <span className="min-w-0 truncate">{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function getManualProgressColorValue(value: string) {
  return (
    manualProgressColorOptions.find((option) => option.value === value)
      ?.value ?? manualProgressColorOptions[0].value
  );
}

function clampNumericInput(value: string, min: number, max: number) {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) {
    return min;
  }

  return Math.max(min, Math.min(max, Math.round(parsedValue)));
}

function AssignedAdminFields({
  assignments,
  selectedAdminIds,
  readOnly = false,
  onToggle,
}: {
  assignments: NonNullable<ShipperUser["admin_assignments"]>;
  selectedAdminIds: string[];
  readOnly?: boolean;
  onToggle: (adminUserId: string) => void;
}) {
  const visibleAssignments = readOnly
    ? assignments.filter((assignment) =>
        selectedAdminIds.includes(assignment.admin_user_id),
      )
    : assignments;

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          {t("admin.userRegistration.assignedAdmins")}
        </span>
      </div>
      {visibleAssignments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
          {t("superAdmin.operators.noOperators")}
        </div>
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {visibleAssignments.map((assignment) => (
            <label
              key={assignment.admin_user_id}
              className={`flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 transition ${
                readOnly
                  ? "cursor-default"
                  : "cursor-pointer hover:border-cyan-300 hover:bg-cyan-50/50"
              }`}
            >
              <input
                type="checkbox"
                checked={selectedAdminIds.includes(assignment.admin_user_id)}
                disabled={readOnly}
                onChange={() => {
                  if (!readOnly) {
                    onToggle(assignment.admin_user_id);
                  }
                }}
                className="mt-1 h-4 w-4 rounded border-slate-300"
              />
              <span className="min-w-0">
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span
                    className="min-w-0 truncate text-sm font-bold text-slate-900"
                    title={assignment.user_name || assignment.email}
                  >
                    {assignment.user_name || assignment.email}
                  </span>
                  {(assignment.staff_roles?.length
                    ? assignment.staff_roles
                    : [assignment.staff_role]
                  ).map((role) => (
                    <span
                      key={role}
                      className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700"
                    >
                      {t(
                        `superAdmin.operators.staffRole.${role}` as TranslationKey,
                      )}
                    </span>
                  ))}
                </span>
                <span
                  className="block truncate text-xs text-slate-500"
                  title={assignment.email}
                >
                  {assignment.email}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function CustomerContactField({
  contacts,
}: {
  contacts: { name: string; email: string }[];
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          {t("admin.shipment.salesRepresentative")}
        </span>
      </div>
      {contacts.length > 0 ? (
        <div className="grid gap-2 md:grid-cols-2">
          {contacts.map((contact) => (
            <div
              key={contact.email.toLowerCase()}
              className="rounded-xl border border-slate-200 bg-white p-3"
            >
              <span
                className="block min-w-0 truncate text-sm font-bold text-slate-900"
                title={contact.name}
              >
                {contact.name}
              </span>
              <span
                className="mt-1 block truncate text-xs text-slate-500"
                title={contact.email}
              >
                {contact.email}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
          {t("admin.shipment.salesRepresentativeUnset")}
        </div>
      )}
    </div>
  );
}

function getShipperCustomerContacts(
  shipperName: string | null,
  shipperOptions: ShipmentShipperOption[],
) {
  const contactsByEmail = new Map<string, { name: string; email: string }>();

  shipperOptions
    .filter((shipper) => shipper.shipper_name === shipperName)
    .forEach((shipper) => {
      const email = shipper.email.trim();
      if (!email) return;
      contactsByEmail.set(email.toLowerCase(), {
        name: shipper.contact_person?.trim() || email,
        email,
      });
    });

  return [...contactsByEmail.values()].sort(
    (first, second) =>
      first.name.localeCompare(second.name, "ja-JP") ||
      first.email.localeCompare(second.email),
  );
}

function getShipperAdminAssignments(
  shipperName: string | null,
  shipperOptions: ShipmentShipperOption[],
) {
  const assignmentsByAdminId = new Map<
    string,
    NonNullable<ShipperUser["admin_assignments"]>[number]
  >();

  shipperOptions
    .filter((shipperUser) => shipperUser.shipper_name === shipperName)
    .flatMap((shipperUser) => shipperUser.admin_assignments ?? [])
    .forEach((assignment) => {
      assignmentsByAdminId.set(assignment.admin_user_id, assignment);
    });

  return [...assignmentsByAdminId.values()];
}

function buildShipperSelectOptions(
  shipperOptions: Pick<ShipperUser, "shipper_name">[],
  currentShipperName: string,
  emptyOptionLabel: string,
) {
  const optionNames = [
    currentShipperName,
    ...shipperOptions.map((shipperUser) => shipperUser.shipper_name),
  ]
    .map((name) => name.trim())
    .filter(Boolean);
  const uniqueOptionNames = Array.from(new Set(optionNames));

  return [
    { value: "", label: emptyOptionLabel },
    ...uniqueOptionNames.map((name) => ({
      value: name,
      label: name,
    })),
  ];
}

function getDefaultAssignedAdminIds(
  shipperName: string,
  shipperOptions: ShipmentShipperOption[],
  fixedAssignedAdminEmail?: string,
) {
  const assignments = getShipperAdminAssignments(shipperName, shipperOptions);

  if (!fixedAssignedAdminEmail) {
    return assignments.map((assignment) => assignment.admin_user_id);
  }

  const normalizedEmail = fixedAssignedAdminEmail.trim().toLowerCase();
  return assignments
    .filter(
      (assignment) => assignment.email.trim().toLowerCase() === normalizedEmail,
    )
    .map((assignment) => assignment.admin_user_id);
}

function TrackingEventFields({
  values,
  standardFlowStepDescriptions,
  onAdd,
  onAddDefaultFlow,
  canAddDefaultFlow,
  onChange,
  onRemove,
}: {
  values: ShipmentJobFormState["tracking_events"];
  standardFlowStepDescriptions: ReadonlySet<string>;
  onAdd: () => void;
  onAddDefaultFlow: () => void;
  canAddDefaultFlow: boolean;
  onChange: (
    index: number,
    field: keyof ShipmentJobFormState["tracking_events"][number],
    value: string,
  ) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          {t("tracking.title")}
        </span>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={!canAddDefaultFlow}
            onClick={onAddDefaultFlow}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("tracking.addDefaultFlow")}
          </button>
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white transition hover:bg-slate-800"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("tracking.add")}
          </button>
        </div>
      </div>
      {values.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
          {t("tracking.noEvents")}
        </div>
      ) : (
        <div className="space-y-3">
          {values.map((event, index) => {
            const hasStartedStep = Boolean(
              event.event_date || event.location.trim(),
            );
            const isStandardFlowStep = standardFlowStepDescriptions.has(
              event.description.trim(),
            );
            const requiresCompletionFields =
              !isStandardFlowStep || hasStartedStep;

            return (
              <div
                key={index}
                className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-[150px_1fr_2fr_44px]"
              >
                <input
                  type="date"
                  required={requiresCompletionFields}
                  value={event.event_date}
                  onChange={(inputEvent) =>
                    onChange(index, "event_date", inputEvent.target.value)
                  }
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-4 focus:ring-slate-200"
                  aria-label={t("tracking.date")}
                />
                <input
                  type="text"
                  required={requiresCompletionFields}
                  value={event.location}
                  placeholder={t("tracking.location")}
                  onChange={(inputEvent) =>
                    onChange(index, "location", inputEvent.target.value)
                  }
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-4 focus:ring-slate-200"
                />
                <input
                  type="text"
                  required
                  value={event.description}
                  placeholder={t("tracking.description")}
                  onChange={(inputEvent) =>
                    onChange(index, "description", inputEvent.target.value)
                  }
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-4 focus:ring-slate-200"
                />
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  aria-label={t("common.delete")}
                  title={t("common.delete")}
                  className="inline-flex h-10 w-10 items-center justify-center self-center rounded-xl border border-rose-200 text-rose-600 transition hover:bg-rose-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BookingDetailFields({
  values,
  onAddBooking,
  onRemoveBooking,
  onBookingNumberChange,
  onAddContainer,
  onRemoveContainer,
  onContainerChange,
}: {
  values: ShipmentJobFormState["booking_details"];
  onAddBooking: () => void;
  onRemoveBooking: (bookingIndex: number) => void;
  onBookingNumberChange: (bookingIndex: number, value: string) => void;
  onAddContainer: (bookingIndex: number) => void;
  onRemoveContainer: (bookingIndex: number, containerIndex: number) => void;
  onContainerChange: (
    bookingIndex: number,
    containerIndex: number,
    field: "size" | "quantity",
    value: string,
  ) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          {t("form.bookingDetails")}
        </span>
        <button
          type="button"
          onClick={onAddBooking}
          className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white transition hover:bg-slate-800"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("form.addBooking")}
        </button>
      </div>
      <div className="space-y-4">
        {values.map((booking, bookingIndex) => (
          <div
            key={bookingIndex}
            className="rounded-xl border border-slate-200 bg-white p-4"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="text-sm font-bold text-slate-700">
                {t("form.bookingNumber")} {bookingIndex + 1}
              </span>
              <button
                type="button"
                onClick={() => onRemoveBooking(bookingIndex)}
                aria-label={t("common.delete")}
                title={t("common.delete")}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-rose-200 text-rose-600 transition hover:bg-rose-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <input
              type="text"
              value={booking.booking_number}
              placeholder="BOOKING-001"
              onChange={(event) =>
                onBookingNumberChange(bookingIndex, event.target.value)
              }
              className="mb-4 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-4 focus:ring-slate-200"
              aria-label={`${t("form.bookingNumber")} ${bookingIndex + 1}`}
            />
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                {t("form.containerDetails")}
              </span>
              <button
                type="button"
                onClick={() => onAddContainer(bookingIndex)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
              >
                <Plus className="h-3.5 w-3.5" />
                {t("form.addContainer")}
              </button>
            </div>
            <div className="space-y-3">
              {booking.containers.map((container, containerIndex) => (
                <div
                  key={containerIndex}
                  className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[minmax(0,1fr)_180px_44px]"
                >
                  <input
                    type="text"
                    value={container.size}
                    placeholder={t("form.containerSize")}
                    onChange={(event) =>
                      onContainerChange(
                        bookingIndex,
                        containerIndex,
                        "size",
                        event.target.value,
                      )
                    }
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-4 focus:ring-slate-200"
                    aria-label={t("form.containerSize")}
                  />
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={container.quantity}
                    placeholder={t("form.containerQuantity")}
                    onChange={(event) =>
                      onContainerChange(
                        bookingIndex,
                        containerIndex,
                        "quantity",
                        event.target.value,
                      )
                    }
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-4 focus:ring-slate-200"
                    aria-label={t("form.containerQuantity")}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      onRemoveContainer(bookingIndex, containerIndex)
                    }
                    aria-label={t("common.delete")}
                    title={t("common.delete")}
                    className="inline-flex h-10 w-10 items-center justify-center self-center rounded-xl border border-rose-200 text-rose-600 transition hover:bg-rose-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function VesselFlightNumberFields({
  values,
  onAdd,
  onRemove,
  onChange,
}: {
  values: string[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onChange: (index: number, value: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          {t("common.vesselFlightNo")}
        </span>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white transition hover:bg-slate-800"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("form.addVesselFlight")}
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {values.map((value, index) => (
          <label key={index} className="block">
            <span className="text-xs font-semibold text-slate-500">
              {formatOrdinal(index + 1)} {t("common.vesselFlightNo")}
            </span>
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={value}
                placeholder="ONE HOUSTON 001W / NH110"
                onChange={(event) => onChange(index, event.target.value)}
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-4 focus:ring-slate-200"
              />
              <InstantTooltip label={t("common.delete")}>
                {(tooltipId) => (
                  <button
                    type="button"
                    disabled={values.length === 1}
                    onClick={() => onRemove(index)}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-rose-200 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label={t("common.delete")}
                    aria-describedby={tooltipId}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </InstantTooltip>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

function formatOrdinal(value: number) {
  const suffix =
    value % 10 === 1 && value % 100 !== 11
      ? "st"
      : value % 10 === 2 && value % 100 !== 12
        ? "nd"
        : value % 10 === 3 && value % 100 !== 13
          ? "rd"
          : "th";

  return `${value}${suffix}`;
}

function TextField({
  label,
  value,
  placeholder,
  type = "text",
  disabled = false,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  disabled = false,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
      >
        {options.map((option, index) => (
          <option key={`${option.value}-${index}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextAreaField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </span>
      <textarea
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-4 focus:ring-slate-200"
      />
    </label>
  );
}

function FileUploadField({
  label,
  existingFiles,
  existingDocuments = [],
  files,
  onPreviewDocument,
  onDeleteDocument,
  onChange,
}: {
  label: string;
  existingFiles: string[];
  existingDocuments?: ShipmentDocument[];
  files: File[];
  onPreviewDocument?: (document: ShipmentDocument) => void;
  onDeleteDocument?: (document: ShipmentDocument) => void;
  onChange: (files: File[]) => void;
}) {
  const inputId = React.useId();

  return (
    <div className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </span>
      <label
        htmlFor={inputId}
        className="mt-2 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center transition hover:border-slate-500 hover:bg-white"
      >
        <span className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white">
          {t("form.selectFiles")}
        </span>
        <span className="mt-3 text-xs text-slate-500">
          {t("form.uploadHelp")}
        </span>
        <input
          id={inputId}
          type="file"
          multiple
          className="sr-only"
          onChange={(event) => onChange(Array.from(event.target.files ?? []))}
        />
      </label>

      {existingDocuments.length > 0 ? (
        <DocumentNameList
          title={t("form.existingFiles")}
          documents={existingDocuments}
          onPreviewDocument={onPreviewDocument}
          onDeleteDocument={onDeleteDocument}
        />
      ) : (
        <FileNameList title={t("form.existingFiles")} names={existingFiles} />
      )}
      <FileNameList
        title={t("form.selectedFiles")}
        names={files.map((file) => file.name)}
      />
    </div>
  );
}

function DocumentNameList({
  title,
  documents,
  onPreviewDocument,
  onDeleteDocument,
}: {
  title: string;
  documents: ShipmentDocument[];
  onPreviewDocument?: (document: ShipmentDocument) => void;
  onDeleteDocument?: (document: ShipmentDocument) => void;
}) {
  if (!documents.length) {
    return null;
  }

  return (
    <div className="mt-3">
      <div className="text-xs font-bold text-slate-500">{title}</div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {documents.map((document) => (
          <span
            key={document.id}
            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700"
          >
            <span className="max-w-44 truncate" title={document.name}>
              {document.name}
            </span>
            {onPreviewDocument && (
              <InstantTooltip label={t("documents.preview")}>
                {(tooltipId) => (
                  <button
                    type="button"
                    onClick={() => onPreviewDocument(document)}
                    className="rounded-full p-0.5 text-cyan-700 transition hover:bg-cyan-100"
                    aria-label={t("documents.preview")}
                    aria-describedby={tooltipId}
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                )}
              </InstantTooltip>
            )}
            {onDeleteDocument && (
              <InstantTooltip label={t("common.delete")}>
                {(tooltipId) => (
                  <button
                    type="button"
                    onClick={() => onDeleteDocument(document)}
                    className="rounded-full p-0.5 text-rose-700 transition hover:bg-rose-100"
                    aria-label={t("common.delete")}
                    aria-describedby={tooltipId}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </InstantTooltip>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

function FileNameList({ title, names }: { title: string; names: string[] }) {
  if (!names.length) {
    return null;
  }

  return (
    <div className="mt-3">
      <div className="text-xs font-bold text-slate-500">{title}</div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {names.map((name) => (
          <span
            key={name}
            className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700"
          >
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}

function splitDocumentNames(value: string) {
  return value
    .split("・")
    .map((name) => name.trim())
    .filter(Boolean);
}
