import { Box, Button, Link, Stack, Step, StepLabel, Stepper, Typography } from "@mui/material";
import React, { useEffect, useState } from "react";
import __ from "../../utils/i18n";
import { I18nStrings } from "../../utils/typed/i18n";
import { topicLoaders } from "../onboarding/topics";
import { OnboardingTopic } from "../onboarding/types";
import { BaseDialog } from "./common/BaseDialog";
import { ZoomableImage } from "./common/ZoomableImage";

export const OnboardingDialog: React.FC<{
    open: boolean;
    topic: string;
    onClose: () => void;
}> = ({ open, topic, onClose }) => {
    const [data, setData] = useState<OnboardingTopic | null>(null);
    const [step, setStep] = useState(0);

    useEffect(() => {
        setStep(0);
        const loader = topicLoaders[topic];
        if (!loader) {
            setData(null);
            return;
        }
        loader()
            .then((m) => setData(m.default))
            .catch(() => setData(null));
    }, [topic]);

    if (!data) return null;

    const current = data.steps[step];

    return (
        <BaseDialog
            open={open}
            onClose={onClose}
            title={__(data.titleKey)}
            maxWidth="lg"
            fullWidth
            actions={
                <Box sx={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                    <Button disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
                        {__(I18nStrings.BTN_BACK)}
                    </Button>
                    {step === data.steps.length - 1 ? (
                        <Button variant="contained" onClick={onClose}>
                            {__(I18nStrings.BTN_DONE)}
                        </Button>
                    ) : (
                        <Button variant="contained" onClick={() => setStep((s) => s + 1)}>
                            {__(I18nStrings.BTN_NEXT)}
                        </Button>
                    )}
                </Box>
            }
        >
            <Stack
                spacing={2}
                sx={{
                    alignItems: "center",
                    width: "100%",
                }}
            >
                <Stepper activeStep={step} alternativeLabel sx={{ width: "100%" }}>
                    {data.steps.map((s, i) => (
                        <Step key={i}>
                            <StepLabel>{__(s.shortTitleKey)}</StepLabel>
                        </Step>
                    ))}
                </Stepper>
                {current.image && (
                    <Box
                        sx={{
                            width: "100%",
                            aspectRatio: "16 / 9",
                            maxHeight: "52vh",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            overflow: "hidden",
                            borderRadius: 1,
                            bgcolor: "background.default",
                        }}
                    >
                        <ZoomableImage
                            src={current.image}
                            alt={__(current.titleKey)}
                            sx={{
                                display: "block",
                                width: "auto",
                                height: "auto",
                                maxWidth: "100%",
                                maxHeight: "100%",
                                objectFit: "contain",
                                borderRadius: 1,
                                boxShadow: 1,
                            }}
                        />
                    </Box>
                )}
                <Typography variant="h6" sx={{ textAlign: "center" }}>
                    {__(current.titleKey)}
                </Typography>
                <Typography variant="body1" sx={{ whiteSpace: "pre-line", textAlign: "center", minHeight: "3em" }}>
                    {__(current.descriptionKey)}
                </Typography>
                {(() => {
                    const link = current.link;
                    if (!link) return null;
                    return (
                        <Link
                            href={link.href}
                            onClick={(e) => {
                                e.preventDefault();
                                window.olsCore.openExternal(link.href);
                            }}
                        >
                            {__(link.textKey)}
                        </Link>
                    );
                })()}
            </Stack>
        </BaseDialog>
    );
};
